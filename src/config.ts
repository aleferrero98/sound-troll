import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export interface AudioEntry {
  path: string;
  probability?: number;
}

export interface AppConfig {
  cronExpression: string;
  timezone: string;
  authorizedUserIds: string[];
  audios: AudioEntry[];
}

export interface Environment {
  token: string;
  guildId: string;
  voiceChannelId: string;
  configPath: string;
}

export function loadEnvironment(): Environment {
  const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };

  return {
    token: required('DISCORD_TOKEN'),
    guildId: required('DISCORD_GUILD_ID'),
    voiceChannelId: required('DISCORD_VOICE_CHANNEL_ID'),
    configPath: path.resolve(process.env.SOUNDTROLL_CONFIG_PATH || './config/config.yml'),
  };
}

export function loadConfig(configPath: string): AppConfig {
  const parsed: unknown = parse(fs.readFileSync(configPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Configuration must be a YAML object.');
  const value = parsed as Partial<AppConfig>;
  if (typeof value.cronExpression !== 'string' || !value.cronExpression.trim()) {
    throw new Error('config.cronExpression is required.');
  }
  if (!Array.isArray(value.audios) || value.audios.length === 0) {
    throw new Error('config.audios must contain at least one audio entry.');
  }
  if (value.authorizedUserIds !== undefined && (!Array.isArray(value.authorizedUserIds) || value.authorizedUserIds.some((id) => typeof id !== 'string'))) {
    throw new Error('config.authorizedUserIds must be a list of user IDs.');
  }

  const audios = value.audios.map((audio, index) => {
    if (!audio || typeof audio.path !== 'string' || !audio.path.trim()) {
      throw new Error(`config.audios[${index}].path is required.`);
    }
    if (audio.probability !== undefined && (typeof audio.probability !== 'number' || !Number.isFinite(audio.probability) || audio.probability < 0 || audio.probability > 100)) {
      throw new Error(`config.audios[${index}].probability must be a number between 0 and 100.`);
    }
    return { ...audio, path: path.resolve(path.dirname(configPath), audio.path) };
  });

  return {
    cronExpression: value.cronExpression,
    timezone: value.timezone || 'UTC',
    authorizedUserIds: value.authorizedUserIds || [],
    audios,
  };
}
