import Database from "better-sqlite3";
import { parentPort } from "node:worker_threads";
import { DB_PATH } from "./index.js";

const FTS_TABLE = "messages_fts";
const INDEXED_TABLE = "fts_indexed";
const BATCH_SIZE = 2000;
const REPORT_EVERY = 20;

const SEED_INDEXED_SQL = `
INSERT OR IGNORE INTO ${INDEXED_TABLE}(id)
SELECT id FROM ${FTS_TABLE};
`;

// 用 fts_indexed 主鍵 join：O(n log n)，不會退化成 O(n²)。
const FETCH_STALE_BATCH_SQL = `
SELECT m.rowid, m.id, m.guild_id, m.channel_id, m.user_id, m.created_at, m.content
FROM messages m
LEFT JOIN ${INDEXED_TABLE} i ON i.id = m.id
WHERE i.id IS NULL
LIMIT ?;
`;

const INSERT_FTS_SQL = `
INSERT OR IGNORE INTO ${FTS_TABLE}(id, guild_id, channel_id, user_id, created_at, content)
VALUES (@id, @guild_id, @channel_id, @user_id, @created_at, @content);
`;

const INSERT_INDEXED_SQL = `
INSERT OR IGNORE INTO ${INDEXED_TABLE}(id) VALUES (@id);
`;

const client = new Database(DB_PATH);
client.pragma("journal_mode = WAL");
client.pragma("busy_timeout = 5000");

function indexedCount(): number {
  const row = client.prepare(`SELECT count(*) AS c FROM ${INDEXED_TABLE}`).get() as { c: number } | undefined;
  return row?.c ?? 0;
}

function messagesCount(): number {
  const row = client.prepare(`SELECT count(*) AS c FROM messages`).get() as { c: number } | undefined;
  return row?.c ?? 0;
}

function post(msg: { type: string; done?: number; total?: number; inserted?: number }): void {
  parentPort?.postMessage(msg);
}

function backfill(): void {
  const total = messagesCount();

  // 一次性遷移：把已存在於 messages_fts 的 id 標記為已索引，避免重跑。
  client.exec(SEED_INDEXED_SQL);

  let done = indexedCount();
  if (done >= total - 10) {
    post({ type: "done", inserted: 0, total });
    return;
  }

  const fetch = client.prepare(FETCH_STALE_BATCH_SQL);
  const insertFts = client.prepare(INSERT_FTS_SQL);
  const insertIndexed = client.prepare(INSERT_INDEXED_SQL);
  const tx = client.transaction((rows: Array<Record<string, unknown>>) => {
    for (const r of rows) {
      insertFts.run(r);
      insertIndexed.run(r);
    }
  });

  let inserted = 0;
  let batches = 0;
  for (;;) {
    const rows = fetch.all(BATCH_SIZE) as Array<Record<string, unknown>>;
    if (rows.length === 0) break;
    tx(rows);
    done += rows.length;
    inserted += rows.length;
    batches++;
    if (batches % REPORT_EVERY === 0) post({ type: "progress", done, total });
  }

  post({ type: "done", inserted, total });
}

try {
  backfill();
} catch (error) {
  console.error("[FTS-WORKER] backfill failed:", error);
  process.exit(1);
} finally {
  client.close();
}