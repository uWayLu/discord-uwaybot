# Commands Reference

## `/summary`

Summarize channel messages over a time range.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `duration` | Yes | Time range (e.g., `30m`, `6h`, `1d`, `7d`) |
| `date` | No | Reference date (e.g., `2024-01-15`) |

### Duration Syntax

| Format | Meaning |
|--------|---------|
| `30m` | Last 30 minutes |
| `6h` | Last 6 hours |
| `1d` | Last 1 day |
| `7d` | Last 7 days |
| `+3d` | Next 3 days from date |
| `-3d` | 3 days before date |

### Date Syntax

- `2024-01-15` — Date only (midnight UTC)
- `2024-01-15T10:00:00` — Date + time (UTC)
- `2024-01-15T10:00:00+08:00` — Date + time + timezone

### Examples

```
/summary 7d
/summary -3d 2024-01-15
/summary +3d 2024-01-15T09:00:00+08:00
```

---

## `/search`

Search for messages matching a query using LLM-powered semantic search.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `duration` | Yes | Time range (same as summary) |
| `query` | Yes | Search keyword or question |
| `date` | No | Reference date |

### Examples

```
/search 7d 薪資制度
/search -3d 2024-01-15 產品開發
/search 14d 關於離職的討論
```

---

## `/backfill`

Import historical messages from Discord into the local database.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `duration` | Yes | How far back to fetch |
| `date` | No | Reference date |

### Limitations

Discord's message-history endpoint can be paginated arbitrarily far back with the `before` parameter — there is **no 14-day limit** on reading history. The 14-day limit only applies to bulk-delete and search.

### Examples

```
/backfill 14d
/backfill -3d 2024-01-15
```

---

## `/backfill-all`

Import historical messages from **all text channels and threads** in the server.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `duration` | No | How far back (`3d`, `7d`, `14d`, `30d`). Omit for full history |
| `date` | No | Reference date |
| `mode` | No | `auto` (default), `incremental`, `full` |

- `auto` — resumes from the last cursor (only new messages) if one exists
- `incremental` — only fetch new messages since the last cursor
- `full` — force a complete rescan ignoring cursors

Only one job may run per server at a time; duplicate invocations are rejected. Channels are crawled in parallel (concurrency 3) with per-channel rate-limit spacing.

### Examples

```
/backfill-all
/backfill-all 7d
/backfill-all 30d mode:full
```

---

## `/backfill-status`

Show the status of the latest `/backfill-all` job: status (running/done/failed), channels & threads progress, and messages fetched/inserted.

---

## `/analyze`

Build a structured speaking-style profile for a member.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `user` | Yes | The member to analyze |

Requires at least 10 analyzable messages. Profiles are cached for 7 days and can be refreshed by running the command again.

### Example

```
/analyze user:@alice
```

---

## `/simulate`

Predict how a member would reply to the current conversation, imitating their style. The reply is always labeled **「🤖 預測回覆 · 非本人發言」** with a confidence score.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `user` | Yes | The member to imitate (needs a `/analyze` profile first) |
| `duration` | No | Context time range (`1h`, `1d`...). Default: last 50 messages |

### Examples

```
/simulate user:@alice
/simulate user:@bob duration:1h
```

---

## @mention

Mention the bot in any channel to get a contextual AI response.

The bot will:
1. Look at recent messages in the channel
2. Build context from the conversation
3. Generate a response using the LLM

### Example

```
@小精靈的工具人 今天討論了什麼？
```
