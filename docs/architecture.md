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
