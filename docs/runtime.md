# Runtime Environment

本文件記錄 discord-uwaybot 的**實際生產運行環境**（2026-08-04 由 PVE 實機查核），供更新部署、排查問題與交接使用。

## 部署拓撲

```
Discord Gateway
      │
      ▼
discord-bot LXC（CT 125，192.168.1.225）   ← 本 bot
      │   systemd: discord-bot.service
      │   /opt/discord-uwaybot
      ▼
openai-proxy LXC（CT 124，192.168.1.224:8000/v1）
      │   bigpickle-proxy（Cloud Mode → OpenCode Zen API）
      ▼
OpenCode Zen API
```

- PVE 主機：`pve7.lan` / ivb（192.168.1.199），PVE 8.4.16
- **LLM 上游依賴 openai-proxy（CT 124）**：該 CT 停擺時 bot 的 LLM 功能（summary/search/analyze/simulate）會失效

## LXC 規格（CT 125 discord-bot）

| 項目 | 值 |
|------|-----|
| OS | Debian 12 (bookworm) |
| 規格 | 1 core / 512MB RAM / 256MB swap / unprivileged / amd64 |
| 網路 | eth0 vmbr0，`192.168.1.225/32`，gw `192.168.1.1` |
| rootfs | `local-lvm` 8G（vm-125-disk-0） |
| Node.js | **v22.23.1 LTS (Jod)** at `/bin/node`（official prebuilt binary），npm 10.9.8 |

> Node 必須 ≥22（better-sqlite3 在 v20 無法載入）。

## 路徑

| 用途 | 路徑 |
|------|------|
| 專案（git checkout，owner 1000:users） | `/opt/discord-uwaybot` |
| 設定檔（root 擁有，含 token） | `/opt/discord-uwaybot/.env` |
| systemd unit | `/etc/systemd/system/discord-bot.service` |
| SQLite DB | `/opt/discord-uwaybot/data/bot.db`（WAL mode，有 `-wal`/`-shm`） |

DB 位於 CT rootfs（`local-lvm`），**無 bind mount**——LXC 重建或 rootfs 損壞即遺失，需備份。

## systemd unit（實際內容）

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

運行方式：`Type=simple`，執行 **build 後**的 `dist/index.js`，環境變數由 `EnvironmentFile` 注入（`.env` 即 config）。

## 環境變數（`.env` key 對照）

密鑰值僅存在於 CT 內的 `.env`，此處不記錄。

| 變數 | 生產值 | 說明 |
|------|--------|------|
| `DISCORD_TOKEN` | （密鑰） | Bot token |
| `DISCORD_CLIENT_ID` | （密鑰） | Application ID |
| `DISCORD_GUILD_ID` | `596011153826512956` | guild 限定註冊指令 |
| `OPENAI_API_KEY` | 任意值 | proxy 不驗證 |
| `OPENAI_BASE_URL` | `http://192.168.1.224:8000/v1` | openai-proxy CT 124 |
| `OPENAI_MODEL` | `big-pickle` | proxy 可用模型之一 |
| `SUMMARY_MAX_HOURS` | `336` | summary/search 最大時距 |
| `SUMMARY_TOP_MINUTES` | `10` | topic 切分間距 |

## 部署現況（2026-08-04）

> ⚠️ 運行中的是 **舊 build**：master @ `58a1a35`（2026-07-17）。Phase 1–3 的新功能（`/backfill-all`、`/backfill-status`、`/analyze`、`/simulate`、user profiles）**尚未上線**。

- `dist/commands/` 僅有 `summary`、`search`、`backfill`（舊 per-channel）
- `bot.db` 僅有 `messages`/`summaries`（+ drizzle_migrations），無 `users`/`user_profiles`/`backfill_jobs`/`backfill_cursors`
- 更新後需跑 migration（`npm run db:migrate`），否則新指令會因缺表失敗

## 更新部署

完整流程已封裝為 `scripts/deploy-lxc.sh`（於本機經 `ssh pve7.lan` 執行，或用 `pct exec`）：

```bash
# 手動步驟（等同 deploy-lxc.sh）
cd /opt/discord-uwaybot
git pull
npm ci
npm run build          # tsc + 複製 prompts
npm run db:migrate     # 需要 .env 可被 tsx 讀取
npm run deploy         # 註冊 slash commands（guild 限定）
systemctl restart discord-bot
```

### 回滾

```bash
cd /opt/discord-uwaybot
git checkout <前一 commit>   # 例如 58a1a35
npm ci && npm run build
systemctl restart discord-bot
```

> migration 不可逆：回滾舊 build 時若 DB 已含新表，舊程式不認得也無害；若需要完全回到舊 schema 需重建 DB（不建議）。

## 操作

```bash
# CT 內
systemctl status discord-bot
systemctl restart discord-bot
journalctl -u discord-bot -f        # 即時 logs

# PVE 主機（read-only 管理）
ssh pve7.lan 'pct list'
ssh pve7.lan 'cat /etc/pve/lxc/125.conf'
ssh pve7.lan 'pct exec 125 -- bash -c "systemctl status discord-bot"'
```

### DB 備份

```bash
# CT 內（SQLite online backup，WAL 安全）
cd /opt/discord-uwaybot
node -e 'const d=require("better-sqlite3");const b=new d("data/bot.db");b.backup("data/bot-$(date +%F).db");b.close()'
```

## 對外依賴

| 依賴 | 位置 | 失效影響 |
|------|------|----------|
| openai-proxy | CT 124 `192.168.1.224:8000` | LLM 功能全掛 |
| Discord Gateway | internet | 無法收發訊息 |
| `pve7.lan` SSH | LAN | 無法部署/管理 |

---

*本文件 2026-08-04 依 CT 125 實機查核建立；變動後請同步更新 `scripts/deploy-lxc.sh`。*
