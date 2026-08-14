import Database from "better-sqlite3";
import { countMentionsOn } from "./services/fts-count.js";

// 使用真實的 countMentionsOn 邏輯，對記憶體 SQLite 進行回歸測試。
// 執行：npx tsx src/self-test.ts

function mkDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      thread_id TEXT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      reply_to TEXT,
      has_embed INTEGER DEFAULT 0
    );
    CREATE VIRTUAL TABLE messages_fts USING fts5(
      id UNINDEXED, guild_id UNINDEXED, channel_id UNINDEXED,
      user_id UNINDEXED, created_at UNINDEXED, content, tokenize='trigram'
    );
    CREATE TRIGGER messages_fts_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(id,guild_id,channel_id,user_id,created_at,content)
      VALUES (new.id,new.guild_id,new.channel_id,new.user_id,new.created_at,new.content);
    END;
  `);
  return db;
}

function seed(db: Database.Database) {
  const ins = db.prepare(
    "INSERT INTO messages(id,guild_id,channel_id,user_id,content,created_at) VALUES(?,?,?,?,?,?)",
  );
  const rows: Array<[string, string, string, string, string, number]> = [
    ["1", "g1", "c1", "u1", "今天講到五條悟很強", 100],
    ["2", "g1", "c1", "u2", "完全沒提到其他內容", 200],
    ["3", "g1", "c2", "u1", "那也是五條悟的領域", 300],
    ["4", "g1", "c2", "u2", "a 100% b _c_ 的問題", 400],
    ["5", "g2", "c9", "u9", "另一伺服器也有五條悟", 500],
    ["6", "g1", "c3", "u3", "簡短", 600],
  ];
  for (const r of rows) ins.run(...r);
}

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n     got ${a}\n     exp ${e}`}`);
}

function keySet(rows: Array<{ key: string; count: number }>): string[] {
  return rows.map((r) => r.key).sort();
}

const db = mkDb();
seed(db);

// ==== FTS 命中（≥3字）====
let r = countMentionsOn(db, { keyword: "五條悟", guildId: "g1" }, true);
check("FTS total g1=2", r.total, 2);
check("FTS byChannel g1", keySet(r.byChannel), ["c1", "c2"]);
check("FTS byUser g1", keySet(r.byUser), ["u1"]);
check("FTS usedFts", r.usedFts, true);

// ==== 跨伺服器隔離 ====
r = countMentionsOn(db, { keyword: "五條悟", guildId: "g2" }, true);
check("FTS total g2=1", r.total, 1);

// ==== 時間篩選 ====
r = countMentionsOn(db, { keyword: "五條悟", guildId: "g1", startMs: 250 }, true);
check("FTS time>=250 total=1", r.total, 1);

// ==== channel 篩選（total 也必須套用 channel 篩選）====
r = countMentionsOn(db, { keyword: "五條悟", guildId: "g1", channelId: "c2" }, true);
check("FTS channel c2 total=1", r.total, 1);
check("FTS channel c2 byChannel", keySet(r.byChannel), ["c2"]);

// ==== user 篩選（total 也必須套用 user 篩選）====
r = countMentionsOn(db, { keyword: "五條悟", guildId: "g1", userId: "u1" }, true);
check("FTS user u1 total=2", r.total, 2);

// ==== LIKE fallback（<3字），% 和 _ 應被跳脫為字面 ====
r = countMentionsOn(db, { keyword: "五條", guildId: "g1" }, true);
check("LIKE 2-char total=2", r.total, 2);
check("LIKE usedFts=false", r.usedFts, false);

// ==== LIKE 萬用字元跳脫 ====
r = countMentionsOn(db, { keyword: "100%", guildId: "g1" }, true);
check("LIKE literal 100% total=1", r.total, 1);
r = countMentionsOn(db, { keyword: "_c_", guildId: "g1" }, true);
check("LIKE literal _c_ total=1", r.total, 1);

// ==== 無命中 ====
r = countMentionsOn(db, { keyword: "不存在詞彙", guildId: "g1" }, true);
check("FTS no match total=0", r.total, 0);

// ==== 全部時間 ====
r = countMentionsOn(db, { keyword: "五條悟", guildId: "g1" }, true);
check("FTS all-time total=2", r.total, 2);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);