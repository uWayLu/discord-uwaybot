# discord-uwaybot

Discord bot for private server message summarization and semantic search. Built with TypeScript + ESM, discord.js v14, SQLite (Drizzle ORM), and OpenAI-compatible LLM API.

## Features

- **`/summary`** — Summarize channel messages over a time range with topic detection
- **`/search`** — Semantic search for relevant messages using LLM
- **`/backfill`** — Import historical messages into the local database (single channel)
- **`/backfill-all`** — Import history across the entire server (all channels + threads, with resume cursors)
- **`/backfill-status`** — Check progress of the running/latest backfill job
- **`/analyze`** — Build a speaking-style profile for a member
- **`/simulate`** — Predict how a member would reply, imitating their style (clearly labeled as AI, not the real person)
- **`@mention`** — Mention the bot for contextual AI responses

## Prerequisites

- Node.js >= 22
- Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- OpenAI-compatible LLM API (e.g., Gemini FastAPI, OpenCode serve)

## Setup

```bash
# Clone
git clone git@github.com:uWayLu/discord-uwaybot.git
cd discord-uwaybot

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your credentials

# Initialize database
npm run db:migrate

# Deploy slash commands to your guild
npm run deploy

# Start
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `DISCORD_CLIENT_ID` | Yes | Discord application client ID |
| `DISCORD_GUILD_ID` | No | Guild ID for instant command registration (global takes ~1h) |
| `OPENAI_API_KEY` | Yes | API key for LLM backend |
| `OPENAI_BASE_URL` | No | LLM API base URL (default: `https://gemini.uwaylu.net/v1`) |
| `OPENAI_MODEL` | No | Model name (default: `gemini-3-flash`) |
| `SUMMARY_MAX_HOURS` | No | Max duration for summary/search in hours (default: `336` = 14 days) |
| `SUMMARY_TOP_MINUTES` | No | Gap in minutes to split topics (default: `10`) |

## Commands

### `/summary <duration> [date]`

Summarize channel messages over a time range.

- `duration` — Time range: `30m`, `6h`, `1d`, `7d`, `-3d`, `+3d`
- `date` — Reference date: `2024-01-15`, `2024-01-15T10:00:00+08:00` (default: now)

**Examples:**
- `/summary 7d` — Last 7 days
- `/summary -3d 2024-01-15` — Jan 12–15, 2024
- `/summary +3d 2024-01-15` — Jan 15–18, 2024

### `/search <duration> <query> [date]`

Search for messages matching a query using LLM-powered semantic search.

- `duration` — Time range (same syntax as summary)
- `query` — Search keyword or question
- `date` — Reference date (optional)

**Examples:**
- `/search 7d 薪資制度` — Search for salary-related discussions
- `/search -3d 2024-01-15 產品開發` — Search product dev discussions around Jan 12–15

### `/backfill <duration> [date]`

Import historical messages from Discord into the local database.

- `duration` — How far back to fetch: `3d`, `7d`, `14d`
- `date` — Reference date (optional)

**Note:** Discord's message-history endpoint (`GET /channels/{id}/messages`) can be paginated arbitrarily far back with the `before` parameter — there is **no 14-day limit** on reading history (the 14-day limit only applies to bulk-delete and search). Rate limits are per-channel (~5 requests / 5s), so `/backfill-all` crawls channels in parallel (concurrency 3) with a small delay between pages.

**Examples:**
- `/backfill 14d` — Import last 14 days
- `/backfill -3d 2024-01-15` — Import Jan 12–15

### `/backfill-all [duration] [date] [mode]`

Import historical messages from **all text channels and threads** in the server into the local database.

- `duration` — How far back: `3d`, `7d`, `14d`, `30d` (omit for full history)
- `date` — Reference date (optional)
- `mode` — `auto` (default; incremental if a resume cursor exists), `incremental` (only new messages), `full` (force a full rescan)

Only one backfill job can run per server at a time; duplicate invocations are rejected. Use `/backfill-status` to check progress.

**Examples:**
- `/backfill-all` — Import entire server history
- `/backfill-all 7d` — Import last 7 days
- `/backfill-all 30d mode:full` — Force a full 30-day rescan

### `/backfill-status`

Show the status of the latest `/backfill-all` job (running/done/failed, channels & threads progress, messages fetched/inserted).

### `/analyze <user>`

Analyze a member's message history and build a structured speaking-style profile (tone, catchphrases, emoji habits, topics, reply length, etc.). Requires at least 10 messages; profiles are cached for 7 days.

### `/simulate <user> [duration]`

Predict how a member would reply to the current conversation, imitating their profile + past similar messages (few-shot retrieval). The result is always labeled **「🤖 預測回覆 · 非本人發言」** with a confidence score, so it is never mistaken for the real person. Requires a profile created via `/analyze` first.

**Examples:**
- `/simulate user:@alice` — Predict Alice's reply based on the last 50 messages in this channel
- `/simulate user:@bob duration:1h` — Use the last hour of conversation as context

### @mention

Mention the bot in any channel to get a contextual AI response based on recent conversation.

## Architecture

```
src/
├── index.ts              # Entry point
├── client.ts             # Discord client
├── config.ts             # Environment config
├── commands/             # Slash commands
│   ├── summary.ts
│   ├── search.ts
│   └── backfill.ts
├── events/               # Discord events
│   ├── ready.ts
│   ├── messageCreate.ts  # Captures messages + @mention handler
│   └── interactionCreate.ts
├── handlers/             # Dynamic loader for commands/events
├── llm/                  # LLM integration
│   ├── client.ts         # OpenAI SDK client
│   ├── summary.ts        # Summary generation
│   ├── search.ts         # Semantic search
│   └── opinion.ts        # @mention responses
├── services/             # Business logic
│   ├── message-store.ts  # SQLite CRUD
│   ├── topic-detector.ts # Split messages into topics
│   └── context-builder.ts
├── prompts/              # LLM system prompts
│   ├── summary.txt
│   ├── search.txt
│   └── opinion.txt
├── utils/                # Helpers
│   ├── time.ts           # Duration parsing
│   └── format.ts         # Discord embeds
├── types/                # TypeScript types
└── db/                   # Drizzle ORM schema + migrations
```

## Tech Stack

- **Runtime:** Node.js 22+ (ESM)
- **Bot:** discord.js v14
- **Database:** SQLite via Drizzle ORM
- **LLM:** OpenAI SDK (compatible with any OpenAI-format API)
- **Validation:** Zod (structured output parsing)
- **Dev:** tsx (TypeScript execution)

## Development

```bash
npm run dev          # Start with hot reload
npm run typecheck    # Type check
npm run deploy       # Register slash commands
npm run db:generate  # Generate migration
npm run db:migrate   # Run migration
```

## Production

- Actual runtime environment (LXC CT 125, systemd, env, deploy/rollback): [`docs/runtime.md`](docs/runtime.md)
- Automated deploy to the production LXC: [`scripts/deploy-lxc.sh`](scripts/deploy-lxc.sh) (`./scripts/deploy-lxc.sh`)

## License

MIT
