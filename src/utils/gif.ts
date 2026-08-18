import { config } from "../config.js";
import { selectMeme } from "../llm/meme-select.js";

const MEMES_FEED = "https://memes.tw/wtf/api";
const MEMES_PAGES = 3;
const MEMES_CAP = 50;

/**
 * 從 memes.tw 熱門 feed 多頁合併挑一張語意最符合 query 的梗圖；
 * memes.tw 挑不到（或無候選）時，退回 klipy 關鍵字搜尋。回傳網址陣列。
 */
export async function searchGif(query: string): Promise<string[]> {
  if (!query.trim()) return [];

  const { candidates, srcById } = await fetchMemeCandidates();
  if (candidates.length > 0) {
    const chosen = await selectMeme(query, candidates, srcById);
    if (chosen) return [chosen];
  }

  return searchKlipy(query);
}

async function fetchMemeCandidates(): Promise<{
  candidates: Array<{ id: number; title: string; hashtag: string; contest: string }>;
  srcById: Map<number, string>;
}> {
  const srcById = new Map<number, string>();
  const candidates: Array<{
    id: number;
    title: string;
    hashtag: string;
    contest: string;
  }> = [];

  for (let page = 1; page <= MEMES_PAGES && candidates.length < MEMES_CAP; page++) {
    let url = MEMES_FEED;
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (config.gif.contest) params.set("contest", config.gif.contest);
    const qs = params.toString();
    if (qs) url += `?${qs}`;

    let list: any[] = [];
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "discord-uwaybot" },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.warn("[GIF] MEMES.TW HTTP", res.status);
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json)) list = json;
    } catch (e) {
      console.error("[GIF] MEMES.TW error:", (e as Error).message);
      continue;
    }

    for (const item of list) {
      if (candidates.length >= MEMES_CAP) break;
      const id = Number(item?.id);
      const src = item?.src;
      if (Number.isNaN(id) || typeof src !== "string" || !isImageUrl(src)) continue;
      if (srcById.has(id)) continue;
      srcById.set(id, src);
      candidates.push({
        id,
        title: typeof item?.title === "string" ? item.title : "",
        hashtag: typeof item?.hashtag === "string" ? item.hashtag : "",
        contest:
          typeof item?.contest?.name === "string" ? item.contest.name : "",
      });
    }
  }

  return { candidates, srcById };
}

/**
 * klipy 關鍵字搜尋（memes.tw 挑不到時作為 fallback）。
 * 每個結果取一張代表性 .gif（md → sm → hd），依相關性排序回傳。
 */
async function searchKlipy(query: string): Promise<string[]> {
  const key = config.gif.klipyApiKey;
  if (!key) return [];
  if (!query.trim()) return [];

  const url =
    `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/search` +
    `?q=${encodeURIComponent(query)}` +
    `&locale=${encodeURIComponent(config.gif.locale)}` +
    `&per_page=8`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "discord-uwaybot" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn("[GIF] KLIPY HTTP", res.status);
      return [];
    }
    const json = await res.json();
    return extractKlipyGifUrls(json);
  } catch (e) {
    console.error("[GIF] KLIPY error:", (e as Error).message);
    return [];
  }
}

function extractKlipyGifUrls(json: unknown): string[] {
  const results = (json as any)?.data?.data;
  if (!Array.isArray(results)) return [];

  const urls: string[] = [];
  for (const item of results) {
    const file = item?.file;
    if (!file || typeof file !== "object") continue;
    const chosen =
      pickGifUrl(file, "md") ?? pickGifUrl(file, "sm") ?? pickGifUrl(file, "hd");
    if (chosen) urls.push(chosen);
  }
  return urls;
}

function pickGifUrl(file: any, size: "md" | "sm" | "hd"): string | null {
  const cand = file?.[size]?.gif?.url;
  return typeof cand === "string" && /\.gif(\?.*)?$/i.test(cand) ? cand : null;
}

const IMAGE_EXT_RE = /\.(gif|jpe?g|png|webp)(\?.*)?$/i;

function isImageUrl(url: string): boolean {
  return IMAGE_EXT_RE.test(url);
}

const EXPLICIT_GIF_RE =
  /(梗圖|來張圖|丟張圖|來點圖|來張梗圖|丟張梗圖|來張gif|來張表情包|表情包|gif|圖片|meme|梗|張圖|給圖|來圖)/i;

const IMAGE_EXT_RE2 = /\.(gif|jpe?g|png|webp|mp4)\b/i;

export function isExplicitGifRequest(text: string): boolean {
  return EXPLICIT_GIF_RE.test(text) || IMAGE_EXT_RE2.test(text);
}

const MENTION_OR_URL_RE =
  /<@!?(\d+)>|<@&(\d+)>|https?:\/\/\S+|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
const GARBAGE_RE = /[^\p{L}\p{N}\s]/gu;

// 剝掉 mention / URL / 表情 / 標點 / 要圖字眼 / 圖片副檔名，回傳乾淨的請求語意；
// 若清完不是有效內容（<2 個中英文字）則回 null。
export function cleanGifQuery(text: string): string | null {
  const cleaned = text
    .replace(MENTION_OR_URL_RE, " ")
    .replace(IMAGE_EXT_RE2, " ")
    .replace(EXPLICIT_GIF_RE, " ")
    .replace(GARBAGE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return null;
  if (!/\p{L}/u.test(cleaned)) return null;
  return cleaned;
}

export function isValidGifKeyword(q: string): boolean {
  return q.trim().length >= 2 && /\p{L}/u.test(q);
}
