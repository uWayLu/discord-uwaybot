# TODO

## Features

- [ ] **Ephemeral replies** — Add `flags: 64` to `/summary` and `/search` so only the caller sees results
- [ ] **Streaming progress** — Update "thinking" message periodically during LLM call (e.g., "正在分析第 2/5 個主題...")
- [ ] **Embedding-based semantic search** — Add vector embeddings for true semantic search (requires embedding API or local model)
- [x] **Next message prediction** — Predict user's next message based on conversation context, grouped by user (`/simulate`)
- [x] **Multi-channel summary** — `/backfill-all` crawls all channels; `/summary` per-channel
- [ ] **Scheduled summaries** — Auto-post daily/weekly summaries to a channel

## Improvements

- [ ] **LLM timeout per-command** — Different timeout for summary vs search vs mention
- [ ] **Message deduplication** — Handle Discord message edits (update DB on messageUpdate)
- [x] **Thread support** — `/backfill-all` captures thread messages (active + archived); `/summary` per-thread channel
- [ ] **Rate limiting** — Prevent command spam
- [ ] **Error reporting** — Better error messages for common failures (token expired, API down)

## Infrastructure

- [ ] **systemd service** — Production deployment setup
- [ ] **Docker support** — Containerized deployment
- [ ] **CI/CD** — GitHub Actions for typecheck + deploy
- [ ] **Database backups** — Automated SQLite backup strategy
