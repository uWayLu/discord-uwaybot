import { db } from "../db/index.js";
import { config } from "../config.js";
import { getDisplayName } from "./user-store.js";
import type { StoredMessage } from "./message-store.js";
import type { Guild } from "discord.js";

const FTS_TABLE = "messages_fts";

export interface RagSource {
  channelName: string;
  authorName: string;
  time: string;
  content: string;
}

export interface RagResult {
  block: string;
  sources: RagSource[];
  query: string;
}

const STOPWORDS =
  /你|我|他|她|它|你們|我們|他們|大家|這|那|嗎|啊|呀|吧|呢|喔|哦|嘛|的|了|是|在|有|就|都|也|嗎|什麼|怎麼|為什麼|為何|請問|上次|那個|這個|一下|可以|能不能|記得|討論|提到|說|講|關於|一下|一下/g;

const SEG_SPLIT = /[\s，。！？,.!?;；:：()（）「」『』"'"、\n]+/;

function cleanText(s: string): string {
  return s
    .replace(/<@!?\d+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(STOPWORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSegments(text: string): string[] {
  return text
    .split(SEG_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
}

/**
 * 用「提問 + 近期對話」組成 FTS5 trigram 查詢（V1 不加 LLM 抽詞）。
 * 回傳 null 表示不值得檢索（太短 / 無內容）。
 */
function buildFtsQuery(question: string, recent: StoredMessage[]): string | null {
  const q = cleanText(question);
  if (!q || q.length < config.rag.minQueryChars) return null;
  if (question.trim().startsWith("/")) return null;

  let segs = extractSegments(q);

  // 提問太零碎時，用近期對話補關鍵詞。
  if (segs.length === 0 && recent.length > 0) {
    const recentText = recent.map((m) => m.content).join(" ").slice(0, 400);
    segs = extractSegments(cleanText(recentText));
  }

  const chosen = [...new Set(segs)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  if (chosen.length === 0) return null;

  return chosen.map((s) => `"${s.replace(/"/g, '""')}"`).join(" OR ");
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 依提問在指定 guild 的全文庫中檢索相關歷史訊息，回傳引用 block 與出處。
 * 若 RAG 停用或無值得檢索的內容，回傳 null（呼叫端可直接略過）。
 */
export async function retrieveRagContext(
  question: string,
  recent: StoredMessage[],
  guild: Guild,
): Promise<RagResult | null> {
  if (!config.rag.enabled) return null;

  const query = buildFtsQuery(question, recent);
  if (!query) return null;

  const params: Record<string, unknown> = {
    q: query,
    guildId: guild.id,
    k: config.rag.topK,
  };
  let timeFilter = "";
  if (config.rag.rangeDays > 0) {
    params.startMs = Date.now() - config.rag.rangeDays * 24 * 60 * 60 * 1000;
    timeFilter = " AND created_at >= @startMs";
  }

  let rows: Array<{
    guild_id: string;
    channel_id: string;
    user_id: string;
    created_at: number;
    content: string;
    rank: number;
  }>;
  try {
    rows = db.$client
      .prepare(
        `SELECT guild_id, channel_id, user_id, created_at, content, bm25(${FTS_TABLE}) AS rank
         FROM ${FTS_TABLE}
         WHERE ${FTS_TABLE} MATCH @q AND guild_id = @guildId${timeFilter}
         ORDER BY rank LIMIT @k`,
      )
      .all(params) as typeof rows;
  } catch (error) {
    console.error("[RAG] FTS query failed:", error);
    return null;
  }

  const threshold = config.rag.bm25Threshold;
  const kept = threshold !== 0 ? rows.filter((r) => r.rank <= threshold) : rows;
  if (kept.length === 0) return null;

  const sources: RagSource[] = [];
  const lines: string[] = [];
  for (const r of kept) {
    const channelName = guild.channels.cache.get(r.channel_id)?.name ?? r.channel_id;
    const authorName =
      (await getDisplayName(r.user_id, r.guild_id)) ?? r.user_id;
    const src: RagSource = {
      channelName,
      authorName,
      time: fmtTime(r.created_at),
      content: r.content,
    };
    sources.push(src);
    lines.push(`[${src.channelName}｜${src.authorName}｜${src.time}] ${src.content}`);
  }

  const block =
    `以下為從本伺服器歷史檢索到的相關訊息（僅供參考與引用；與當前話題無關請忽略，引用時請標註來源）：\n` +
    lines.join("\n");

  return { block, sources, query };
}
