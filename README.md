# SoundTroll

<p align="center">
  <img src="soundtroll.png" alt="SoundTroll" width="260">
</p>

SoundTroll is a Discord bot built with Node.js and TypeScript. It joins a configured voice channel on a schedule, randomly selects and plays one audio file according to its configured probability, and disconnects when playback finishes. You can also trigger playback with `/now` in a direct message.

## Requirements

- Node.js 22.12 or later, or Docker with Docker Compose.
- A Discord bot added to the target server with **View Channels**, **Connect**, and **Speak** permissions for the configured voice channel.
- FFmpeg available on your local `PATH` when running outside Docker. The Docker image includes FFmpeg.

## Configuration

1. Copy `.env.example` to `.env` and set the required values:

   | Variable | Description |
   | --- | --- |
   | `DISCORD_TOKEN` | Discord bot token. Keep it private. |
   | `DISCORD_GUILD_ID` | ID of the server containing the voice channel. |
   | `DISCORD_VOICE_CHANNEL_ID` | ID of the voice channel where audio will play. |
   | `SOUNDTROLL_CONFIG_PATH` | Path to the YAML configuration file. Defaults to `./config/config.yml`; Docker Compose sets it to `/app/config/config.yml`. |

2. Configure `config/config.yml`:

   ```yaml
   cronExpression: "0 0 20 * * *"
   timezone: UTC
   authorizedUserIds: []

   audios:
     - path: ../audio/clip-a.mp3
       probability: 60
     - path: ../audio/clip-b.mp3
     - path: ../audio/clip-c.mp3
   ```

   - `cronExpression`: six-field cron expression, including seconds (`second minute hour day month day-of-week`).
   - `timezone`: IANA time zone, such as `America/New_York`. Defaults to `UTC` when omitted.
   - `authorizedUserIds`: Discord user IDs allowed to run `/now`. If omitted or empty, anyone can use the command.
   - `audios`: audio files available for playback. Relative paths are resolved from the YAML file's directory.
   - `probability`: optional percentage from 0 to 100. Explicit percentages are retained, and the remaining percentage is divided equally among entries without a value. If every entry has a percentage, the values must total 100%; a tolerance of 0.11 percentage points is allowed for rounding. Invalid distributions are logged and replaced with equal probabilities for all entries.

3. Add audio files to the `audio/` directory. Supported formats depend on FFmpeg.

## Run locally

```bash
npm install
npm run dev
```

To build and run the compiled application:

```bash
npm run build
npm start
```

## Run with Docker Compose

After configuring `.env`, `config/config.yml`, and the audio files in `audio/`, run:

```bash
docker compose up --build -d
```

View logs or stop the bot with:

```bash
docker compose logs -f
docker compose down
```

SoundTroll registers `/now` globally for the Bot DM context. Invite it to the server with the permissions listed above, and ensure application commands are enabled for direct messages in the Discord Developer Portal.
