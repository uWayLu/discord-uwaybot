# Architecture

## Overview

```
User → Discord → discord-uwaybot → LLM API
                  ↓
               SQLite DB
```

The bot captures messages in real-time via `messageCreate`, stores them in SQLite, and uses an LLM to generate summaries and search results on demand.

## Data Flow

### Message Capture

```
messageCreate event
  → storeMessage() → SQLite (messages table)
  → upsertUser() → SQLite (users table)
```

### Summary Flow

```
/summary 7d
  → getMessagesInTimeRange(channelId, start, end)
  → filter out bot messages, commands, embeds
  → detectTopics() — group by reply chain, thread, time gap
  → summarizeTopics() — LLM call with structured output
  → buildSummaryEmbed() — Discord embed
  → editReply()
```

### Search Flow

```
/search 7d 薪資
  → getMessagesInTimeRange(channelId, start, end)
  → filter messages
  → searchMessages() — LLM call to find relevant messages
  → buildSearchEmbed() — Discord embed
  → editReply()
```

### @mention Flow

```
@bot mentioned
  → getRecentMessages(channelId, 50)
  → buildOpinionContext() — find reply/thread/recent context
  → getOpinion() — LLM call
  → buildOpinionEmbed() — Discord embed
  → reply()
```

### Backfill-all Flow

```
/backfill-all
  → getRunningJob(guildId) — reject if a job is already running
  → createJob() — insert backfill_jobs (status=running)
  → reply "started, check /backfill-status"
  → runBackfill() in background:
      → guild.channels.fetch() — collect text/news/forum/media channels
      → collectThreads() — active + archived (public/private) threads per channel
      → crawl each channel/thread with concurrency 3:
          → getCursor() — resume from watermark if present
          → paginate messages.fetch({ before|after, limit:100 }) with ~250ms spacing
          → backfillMessagesBulk() — INSERT OR IGNORE, counts inserted
          → setCursor() — update watermark
          → updateJob() — progress counters
      → completeJob(done|failed)
```

### Analyze Flow

```
/analyze <user>
  → getMessagesByUser(userId, guildId, 300)
  → generateProfile() — LLM persona extraction (structured JSON)
  → saveProfile() — cache in user_profiles
  → buildProfileEmbed()
```

### Simulate Flow

```
/simulate <user>
  → getProfile() — cached persona (requires /analyze first)
  → getRecentMessages() / getMessagesInTimeRange() — conversation context
  → getMessagesByUser() + retrieveExamples() — few-shot style examples (keyword overlap)
  → predictReply() — LLM generates { predicted_reply, confidence, style_features }
  → buildSimulateEmbed() — labeled 「🤖 預測回覆 · 非本人發言」
```

## Database Schema

### `messages` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Discord message ID (primary key) |
| `guild_id` | TEXT | Discord guild ID |
| `channel_id` | TEXT | Discord channel ID |
| `thread_id` | TEXT | Thread ID (if in thread) |
| `user_id` | TEXT | Message author ID |
| `content` | TEXT | Message content |
| `created_at` | INTEGER | Timestamp in milliseconds |
| `reply_to` | TEXT | Message ID being replied to |
| `has_embed` | INTEGER | Whether message has embeds |

### `users` table

Caches display names and message counts per member so names survive after members leave the cache.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | User ID (PK) |
| `guild_id` | TEXT | Guild ID |
| `display_name` | TEXT | Last known display name |
| `first_seen` / `last_seen` | INTEGER | First/last message timestamps |
| `msg_count` | INTEGER | Stored message count |
| `updated_at` | INTEGER | Last update timestamp |

### `user_profiles` table

Caches LLM-generated speaking-style profiles for `/analyze` and `/simulate`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | User ID (PK) |
| `guild_id` | TEXT | Guild ID |
| `profile_json` | TEXT | Structured persona JSON |
| `sample_count` | INTEGER | Messages used to build the profile |
| `updated_at` | INTEGER | Profile generation time (TTL 7 days) |

### `backfill_jobs` table

Tracks one background `/backfill-all` run per guild; doubles as a run-lock (duplicate invocations are rejected while a `running` job exists).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment PK |
| `guild_id` | TEXT | Guild being crawled |
| `status` | TEXT | `running` / `done` / `failed` |
| `channels_total` / `channels_done` | INTEGER | Channel progress |
| `threads_total` / `threads_done` | INTEGER | Thread progress |
| `messages_fetched` / `messages_inserted` | INTEGER | Message counts |
| `error` | TEXT | Failure reason, if any |
| `started_at` / `finished_at` | INTEGER | Job timestamps |

### `backfill_cursors` table

Per-channel resume watermarks so re-runs only fetch new messages (incremental mode).

| Column | Type | Description |
|--------|------|-------------|
| `channel_id` | TEXT | Channel or thread ID (PK) |
| `guild_id` | TEXT | Guild ID |
| `last_message_id` | TEXT | Newest message ID already fetched |
| `last_fetched_at` | INTEGER | Last fetch time |

### `summaries` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment |
| `channel_id` | TEXT | Channel ID |
| `start_at` | INTEGER | Summary start time |
| `end_at` | INTEGER | Summary end time |
| `summary_json` | TEXT | JSON summary |
| `created_at` | INTEGER | When summary was generated |

## Topic Detection

Messages are grouped into topics by:

1. **Reply chains** — Messages replying to the same parent
2. **Thread messages** — Messages in the same thread
3. **Time gaps** — Messages separated by >10 minutes (configurable)

## LLM Integration

Uses the OpenAI SDK for API calls. Supports any OpenAI-compatible API:

- Gemini FastAPI
- OpenCode serve
- OpenAI API
- Any compatible endpoint

Structured output is enforced via Zod schemas + `response_format`.

## Error Handling

- Unhandled rejections are caught globally (`process.on("unhandledRejection")`)
- Command errors are caught and reported to the user
- LLM call failures return graceful fallbacks (empty results)
- `sendTyping` failures are silently ignored to prevent crashes
