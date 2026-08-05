# Setup Guide

## 1. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** tab → copy the token
4. Go to **OAuth2** → copy the Client ID
5. Enable these **Privileged Gateway Intents**:
   - Message Content Intent
   - Server Members Intent
6. Generate invite URL with scopes: `bot`, `applications.commands`
7. Permissions: Send Messages, Read Message History, Embed Links, Use Slash Commands

## 2. Install

```bash
git clone git@github.com:uWayLu/discord-uwaybot.git
cd discord-uwaybot
npm install
```

## 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Discord
DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here
DISCORD_GUILD_ID=your-guild-id-here  # Optional but recommended

# LLM Backend
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=http://your-llm-host:8000/v1
OPENAI_MODEL=your-model-name

# Options
SUMMARY_MAX_HOURS=336   # 14 days
SUMMARY_TOP_MINUTES=10  # Topic gap
```

## 4. Initialize Database

```bash
npm run db:migrate
```

## 5. Deploy Commands

```bash
# To specific guild (instant)
DISCORD_GUILD_ID=your-guild-id npm run deploy

# To all guilds (takes up to 1 hour)
npm run deploy
```

## 6. Start

```bash
npm run dev  # Development
```

## LLM Backend Options

### Option A: OpenCode serve (recommended)

Uses [OpenCode](https://github.com/anomalyco/opencode) serve mode behind a proxy.

```bash
# On your server
opencode serve --port 3080

# Proxy (e.g., Big Pickle Proxy)
# Configure to forward to http://localhost:3080
```

### Option B: Gemini FastAPI

```bash
# pip install gemini-fastapi
gemini-fastapi --port 8000
```

### Option C: Any OpenAI-compatible API

Set `OPENAI_BASE_URL` to your API endpoint.

## Production Deployment

> 實際運行環境（LXC CT 125 等）見 [`docs/runtime.md`](runtime.md)。

### systemd service

```ini
[Unit]
Description=Discord uWayBot
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/discord-uwaybot
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/discord-uwaybot/.env

[Install]
WantedBy=multi-user.target
```

- 環境變數由 `EnvironmentFile` 注入，`ExecStart` 不需再加 `--env-file=`（重複指定無效）
- `ExecStart` 執行 build 後的 `dist/index.js`
- 專案內含自動化部署腳本：`scripts/deploy-lxc.sh`

### Build for production

```bash
npm run build
npm run deploy  # Re-deploy commands
sudo systemctl restart discord-uwaybot
```
