import { db } from "./index.js";
import type Database from "better-sqlite3";
import { Worker } from "node:worker_threads";
import { join } from "node:path";

const FTS_TABLE = "messages_fts";

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

const CREATE_TRIGGER_SQL = `
CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
  INSERT OR IGNORE INTO ${FTS_TABLE}(id, guild_id, channel_id, user_id, created_at, content)
  VALUES (new.id, new.guild_id, new.channel_id, new.user_id, new.created_at, new.content);
END;
`;

let initialized = false;

/**
 * 建立 FTS5 表與同步 trigger，並在 worker thread 中非阻塞地回填既有 messages。
 * 回填跑在獨立執行緒 + 批次 commit，不會卡住主事件迴圈，進度也可續跑。
 */
export async function initFts(): Promise<void> {
  if (initialized) return;

  const client = db.$client;
  client.exec(CREATE_FTS_SQL);
  client.exec(CREATE_TRIGGER_SQL);
  initialized = true;

  startBackfillWorker();
}

function startBackfillWorker(): void {
  const isProd = import.meta.dirname.endsWith("dist");
  const workerPath = join(import.meta.dirname, isProd ? "fts-worker.js" : "fts-worker.ts");
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

function ftsCount(client: Database.Database): number {
  const row = client.prepare(`SELECT count(*) AS c FROM ${FTS_TABLE}`).get() as { c: number } | undefined;
  return row?.c ?? 0;
}

function messagesCount(client: Database.Database): number {
  const row = client.prepare(`SELECT count(*) AS c FROM messages`).get() as { c: number } | undefined;
  return row?.c ?? 0;
}

export function ftsIndexReady(): boolean {
  try {
    const client = db.$client;
    return ftsCount(client) >= messagesCount(client) - 10;
  } catch {
    return false;
  }
}
