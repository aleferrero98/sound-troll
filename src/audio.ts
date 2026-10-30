import { spawn } from 'node:child_process';
import { createAudioPlayer, createAudioResource, entersState, getVoiceConnection, joinVoiceChannel, AudioPlayerStatus, VoiceConnectionStatus, StreamType } from '@discordjs/voice';
import { Client } from 'discord.js';
import { AppConfig, AudioEntry } from './config';

const TOLERANCE = 0.11;

export function calculateProbabilities(audios: AudioEntry[]): number[] {
  const explicit = audios.map((audio) => audio.probability);
  const configured = explicit.filter((value): value is number => value !== undefined);
  const unspecifiedCount = explicit.length - configured.length;

  if (unspecifiedCount === 0) {
    const total = configured.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > TOLERANCE) {
      console.error(`Configured audio probabilities total ${total}% instead of 100%. Falling back to equal probabilities.`);
      return audios.map(() => 1 / audios.length);
    }
    return configured.map((value) => value / total);
  }

  const remaining = 100 - configured.reduce((sum, value) => sum + value, 0);
  if (remaining < -TOLERANCE) {
    console.error(`Configured audio probabilities exceed 100% (${100 - remaining}%). Falling back to equal probabilities.`);
    return audios.map(() => 1 / audios.length);
  }
  const share = Math.max(0, remaining) / unspecifiedCount / 100;
  return explicit.map((value) => value === undefined ? share : value / 100);
}

function chooseAudio(config: AppConfig): AudioEntry {
  const probabilities = calculateProbabilities(config.audios);
  const draw = Math.random();
  let cumulative = 0;
  for (let index = 0; index < config.audios.length; index += 1) {
    cumulative += probabilities[index];
    if (draw < cumulative || index === config.audios.length - 1) return config.audios[index];
  }
  return config.audios[config.audios.length - 1];
}

export async function playOneAudio(client: Client, guildId: string, channelId: string, config: AppConfig): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isVoiceBased() || channel.guildId !== guildId) {
    throw new Error('The configured channel does not exist, is not a voice channel, or does not belong to the configured server.');
  }

  const audio = chooseAudio(config);
  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });
  const describeState = (state: typeof connection.state): string => {
    const reason = 'reason' in state ? ` reason=${state.reason}` : '';
    const closeCode = 'closeCode' in state ? ` closeCode=${state.closeCode}` : '';
    return `${state.status}${reason}${closeCode}`;
  };
  connection.on('stateChange', (oldState, newState) => {
    console.info(`Voice connection state: ${describeState(oldState)} -> ${describeState(newState)}`);
  });
  connection.on('error', (error) => {
    console.error('[voice error]', error);
  });
  const player = createAudioPlayer();
  connection.subscribe(player);
  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-i', audio.path,
    '-vn', '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2', '-f', 'ogg', 'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  ffmpeg.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });

  try {
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      throw new Error(`Voice connection did not become ready (current state: ${connection.state.status}).`, { cause: error });
    }
    const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.OggOpus });
    player.play(resource);
    console.info(`Playing ${audio.path} in voice channel ${channelId}.`);
    await Promise.race([
      entersState(player, AudioPlayerStatus.Playing, 15_000).catch((error: unknown) => {
        throw new Error(`Audio playback did not start (current player state: ${player.state.status}).`, { cause: error });
      }),
      new Promise<never>((_, reject) => player.once('error', reject)),
    ]);
    await Promise.race([
      entersState(player, AudioPlayerStatus.Idle, 10 * 60_000).catch((error: unknown) => {
        throw new Error(`Audio playback did not finish successfully (current player state: ${player.state.status}).`, { cause: error });
      }),
      new Promise<never>((_, reject) => {
        ffmpeg.once('error', reject);
        ffmpeg.once('close', (code) => {
          if (code !== 0) reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        });
      }),
      new Promise<never>((_, reject) => player.once('error', reject)),
    ]);
  } finally {
    ffmpeg.kill('SIGKILL');
    player.stop(true);
    const activeConnection = getVoiceConnection(guildId);
    activeConnection?.destroy();
  }
}
