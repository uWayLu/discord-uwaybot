import { db } from "./index.js";
import type Database from "better-sqlite3";

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

const FETCH_STALE_BATCH_SQL = `
SELECT m.rowid, m.id, m.guild_id, m.channel_id, m.user_id, m.created_at, m.content
FROM messages m
WHERE NOT EXISTS (SELECT 1 FROM ${FTS_TABLE} f WHERE f.id = m.id)
LIMIT ?
`;

const INSERT_BATCH_SQL = `
INSERT OR IGNORE INTO ${FTS_TABLE}(id, guild_id, channel_id, user_id, created_at, content)
VALUES (@id, @guild_id, @channel_id, @user_id, @created_at, @content)
`;

const BATCH_SIZE = 2000;

let initialized = false;

/**
 * 建立 FTS5 表與同步 trigger，並回填既有 messages（非阻塞）。
 */
export async function initFts(): Promise<void> {
  if (initialized) return;

  const client = db.$client;
  client.exec(CREATE_FTS_SQL);
  client.exec(CREATE_TRIGGER_SQL);
  initialized = true;

  // 非阻塞回填
  setTimeout(() => {
    try {
      backfillFts();
    } catch (error) {
      console.error("[FTS] backfill failed:", error);
    }
  }, 1000);
}

function ftsCount(client: Database.Database): number {
  const row = client.prepare(`SELECT count(*) AS c FROM ${FTS_TABLE}`).get() as {
    c: number;
  };
  return row?.c ?? 0;
}

function messagesCount(client: Database.Database): number {
  const row = client.prepare(`SELECT count(*) AS c FROM messages`).get() as {
    c: number;
  };
  return row?.c ?? 0;
}

export function backfillFts(): void {
  const client = db.$client;
  const stale = messagesCount(client) - ftsCount(client);
  if (stale <= 0) {
    console.log("[FTS] index up to date");
    // 每週優化一次（封存空頁，對 contentless 有用）
    client.exec(`INSERT INTO ${FTS_TABLE}(${FTS_TABLE}) VALUES('optimize')`);
    return;
  }

  console.log(`[FTS] backfilling ${stale} stale rows...`);
  const fetchBatch = client.prepare(FETCH_STALE_BATCH_SQL);
  const insertBatch = client.prepare(INSERT_BATCH_SQL);
  let done = 0;

  const tx = client.transaction(() => {
    let rows = fetchBatch.all(BATCH_SIZE) as Array<Record<string, unknown>>;
    while (rows.length > 0) {
      for (const r of rows) insertBatch.run(r);
      done += rows.length;
      rows = fetchBatch.all(BATCH_SIZE) as Array<Record<string, unknown>>;
    }
  });
  tx();

  console.log(`[FTS] backfill complete, +${done} rows`);
}

export function ftsIndexReady(): boolean {
  try {
    const client = db.$client;
    return ftsCount(client) >= messagesCount(client) - 10;
  } catch {
    return false;
  }
}

// 測試用
export function _ensureFtsInitializedForTest(): void {
  if (!initialized) {
    const client = db.$client;
    client.exec(CREATE_FTS_SQL);
    client.exec(CREATE_TRIGGER_SQL);
    initialized = true;
  }
}