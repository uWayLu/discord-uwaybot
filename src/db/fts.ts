import { db } from "./index.js";
import type Database from "better-sqlite3";
import { Worker } from "node:worker_threads";
import { join } from "node:path";

const FTS_TABLE = "messages_fts";
const INDEXED_TABLE = "fts_indexed";

const CREATE_FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
  id UNINDEXED,
  guild_id UNINDEXED,
  channel_id UNINDEXED,
  user_id UNINDEXED,
  created_at UNINDEXED,
  content,
  tokenize='trigram'
);
`;

// 追蹤哪些 message 已索引（id 有主鍵索引，供回填用高效的 LEFT JOIN 找未索引者）。
const CREATE_INDEXED_SQL = `
CREATE TABLE IF NOT EXISTS ${INDEXED_TABLE} (
  id TEXT PRIMARY KEY
);
`;

// 同時寫入 FTS 表與追蹤表：新插入的訊息立即被記錄為「已索引」。
const CREATE_TRIGGER_SQL = `
CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
  INSERT OR IGNORE INTO ${FTS_TABLE}(id, guild_id, channel_id, user_id, created_at, content)
  VALUES (new.id, new.guild_id, new.channel_id, new.user_id, new.created_at, new.content);
  INSERT OR IGNORE INTO ${INDEXED_TABLE}(id) VALUES (new.id);
END;
`;

let initialized = false;

/**
 * 建立 FTS5 表、追蹤表與同步 trigger，並在 worker thread 中非阻塞地回填既有 messages。
 * 回填跑在獨立執行緒 + 批次 commit，不會卡住主事件迴圈，進度也可續跑。
 */
export async function initFts(): Promise<void> {
  if (initialized) return;

  const client = db.$client;
  client.exec(CREATE_FTS_SQL);
  client.exec(CREATE_INDEXED_SQL);
  // 每次 drop+create 確保 trigger 與目前 schema 一致（舊版 trigger 不同步 fts_indexed）。
  client.exec(`DROP TRIGGER IF EXISTS messages_fts_ai;`);
  client.exec(CREATE_TRIGGER_SQL);
  initialized = true;

  startBackfillWorker();
}

function startBackfillWorker(): void {
  const ext = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const workerPath = join(import.meta.dirname, `fts-worker.${ext}`);
  const worker = new Worker(workerPath);

  worker.on("message", (msg: { type?: string; done?: number; total?: number; inserted?: number }) => {
    if (msg?.type === "progress") {
      console.log(`[FTS] backfill ${msg.done}/${msg.total}...`);
    } else if (msg?.type === "done") {
      console.log(`[FTS] backfill complete, +${msg.inserted ?? 0} rows (${msg.total ?? 0} total)`);
    }
  });
  worker.on("error", (err) => console.error("[FTS] backfill worker error:", err));
  worker.on("exit", (code) => {
    if (code !== 0) console.error(`[FTS] backfill worker exited with code ${code}`);
  });
}

function indexedCount(client: Database.Database): number {
  const row = client.prepare(`SELECT count(*) AS c FROM ${INDEXED_TABLE}`).get() as { c: number } | undefined;
  return row?.c ?? 0;
}

function messagesCount(client: Database.Database): number {
  const row = client.prepare(`SELECT count(*) AS c FROM messages`).get() as { c: number } | undefined;
  return row?.c ?? 0;
}

export function ftsIndexReady(): boolean {
  try {
    const client = db.$client;
    return indexedCount(client) >= messagesCount(client) - 10;
  } catch {
    return false;
  }
}
