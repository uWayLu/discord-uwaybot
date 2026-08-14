import { db } from "../db/index.js";
import { ftsIndexReady } from "../db/fts.js";
import type Database from "better-sqlite3";

export interface CountFilters {
  keyword: string;
  guildId: string;
  channelId?: string | null;
  userId?: string | null;
  startMs?: number | null;
  endMs?: number | null;
}

export interface CountRow {
  key: string;
  count: number;
}

export interface CountResult {
  total: number;
  byChannel: CountRow[];
  byUser: CountRow[];
  usedFts: boolean;
}

const MIN_FTS_CHARS = 3;
const TOP_USERS = 10;

function keywordForFts(keyword: string): string | null {
  const trimmed = keyword.trim();
  if (trimmed.length < MIN_FTS_CHARS) return null;
  // trigram tokenizer：包成片語以匹配子字串
  return `"${trimmed.replace(/"/g, '""')}"`;
}

export function countMentions(filters: CountFilters): CountResult {
  return countMentionsOn(db.$client, filters, ftsIndexReady());
}

export function countMentionsOn(
  client: Database.Database,
  filters: CountFilters,
  ftsReady: boolean,
): CountResult {
  const ftsKw = keywordForFts(filters.keyword);
  const useFts = ftsKw !== null && ftsReady;

  const params: Record<string, unknown> = {
    guildId: filters.guildId,
    channelId: filters.channelId ?? null,
    userId: filters.userId ?? null,
    startMs: filters.startMs ?? 0,
    endMs: filters.endMs ?? Number.MAX_SAFE_INTEGER,
    kw: filters.keyword,
    ftsKw,
  };

  let where = "WHERE guild_id = @guildId AND created_at >= @startMs AND created_at <= @endMs";
  let whereKw: string;
  if (useFts) {
    whereKw = "messages_fts MATCH @ftsKw";
  } else {
    whereKw = "content LIKE '%' || @kw || '%' ESCAPE '\\'";
    params.kw = escapeLike(filters.keyword);
  }
  where += " AND " + whereKw;

  const channelWhere = filters.channelId ? " AND channel_id = @channelId" : "";
  const userWhere = filters.userId ? " AND user_id = @userId" : "";

  const totalRow = client
    .prepare(`SELECT count(*) AS c FROM ${useFts ? "messages_fts" : "messages"} ${where}${channelWhere}${userWhere}`)
    .get(params) as { c: number };
  const total = totalRow?.c ?? 0;

  const byChannel = (client
    .prepare(
      `SELECT channel_id AS key, count(*) AS count FROM ${useFts ? "messages_fts" : "messages"} ${where}${channelWhere} GROUP BY channel_id ORDER BY count DESC`,
    )
    .all(params) as CountRow[]);
  const byUser = (client
    .prepare(
      `SELECT user_id AS key, count(*) AS count FROM ${useFts ? "messages_fts" : "messages"} ${where}${userWhere} GROUP BY user_id ORDER BY count DESC LIMIT ${TOP_USERS}`,
    )
    .all(params) as CountRow[]);

  return { total, byChannel, byUser, usedFts: useFts };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}
