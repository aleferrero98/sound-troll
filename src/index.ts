import 'dotenv/config';
import { CronJob } from 'cron';
import { Client, GatewayIntentBits, InteractionContextType, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { loadConfig, loadEnvironment } from './config';
import { playOneAudio } from './audio';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const config = loadConfig(environment.configPath);
  const command = new SlashCommandBuilder()
    .setName('now')
    .setDescription('Play a randomly selected audio file in the configured voice channel now.')
    .setContexts(InteractionContextType.BotDM);

  const rest = new REST({ version: '10' }).setToken(environment.token);
  await rest.put(Routes.applicationCommands((await rest.get(Routes.oauth2CurrentApplication()) as { id: string }).id), { body: [command.toJSON()] });

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  let running = false;
  const run = async (source: string): Promise<boolean> => {
    if (running) return false;
    running = true;
    try {
      await playOneAudio(client, environment.guildId, environment.voiceChannelId, config);
      return true;
    } catch (error) {
      console.error(`Playback failed (${source}):`, error);
      return false;
    } finally {
      running = false;
    }
  };

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'now') return;
    if (interaction.guildId !== null) {
      await interaction.reply({ content: 'This command can only be used in a direct message.', ephemeral: true });
      return;
    }
    if (config.authorizedUserIds.length > 0 && !config.authorizedUserIds.includes(interaction.user.id)) {
      await interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
      return;
    }
    if (running) {
      await interaction.reply({ content: "I'm already running!", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const success = await run('/now');
    await interaction.editReply(success ? 'Audio playback completed.' : 'Audio playback failed. Check the bot logs for details.');
  });

  client.once('ready', () => {
    console.info(`SoundTroll connected as ${client.user?.tag}.`);
    try {
      new CronJob(config.cronExpression, () => {
        void run('cron').then((success) => {
          if (!success && running) console.warn('Skipped scheduled playback because another playback is already in progress.');
        });
      }, null, true, config.timezone).start();
      console.info(`Scheduled job started: ${config.cronExpression} (${config.timezone}).`);
    } catch (error) {
      console.error('Failed to start the scheduled job:', error);
      process.exitCode = 1;
    }
  });

  await client.login(environment.token);
}

main().catch((error: unknown) => {
  console.error('Failed to start SoundTroll:', error);
  process.exitCode = 1;
});
