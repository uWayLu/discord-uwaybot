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

Discord API limits message fetching to approximately 14 days. Messages older than this cannot be imported via the REST API.

### Examples

```
/backfill 14d
/backfill -3d 2024-01-15
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
