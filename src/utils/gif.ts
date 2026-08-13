import { config } from "../config.js";

export async function searchGif(
  query: string,
  locale: string = config.gif.locale,
): Promise<string[]> {
  const key = config.gif.klipyApiKey;
  if (!key) return [];
  if (!query.trim()) return [];

  const url =
    `https://api.klipy.com/api/v1/${key}/gifs/search` +
    `?q=${encodeURIComponent(query)}` +
    `&locale=${encodeURIComponent(locale)}` +
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
    return extractGifUrls(json);
  } catch (e) {
    console.error("[GIF] KLIPY error:", (e as Error).message);
    return [];
  }
}

// 每個搜尋結果取一張「代表性 GIF」，依相關性排序（第 1 個最相關）。
// 優先 md（Discord 大小適中）→ sm → hd，只取 .gif。
function extractGifUrls(json: any): string[] {
  const results = json?.data?.data;
  if (!Array.isArray(results)) return [];

  const urls: string[] = [];
  for (const item of results) {
    const file = item?.file;
    if (!file || typeof file !== "object") continue;
    const chosen =
      pickUrl(file, "md") ?? pickUrl(file, "sm") ?? pickUrl(file, "hd");
    if (chosen) urls.push(chosen);
  }
  return urls;
}

function pickUrl(file: any, size: "md" | "sm" | "hd"): string | null {
  const cand = file?.[size]?.gif?.url;
  return typeof cand === "string" && /\.gif(\?.*)?$/i.test(cand) ? cand : null;
}

const EXPLICIT_GIF_RE =
  /(梗圖|來張圖|丟張圖|來點圖|來張梗圖|丟張梗圖|來張gif|來張表情包|表情包|gif|圖片|meme|梗|張圖|給圖|來圖)/i;

const IMAGE_EXT_RE = /\.(gif|jpe?g|png|webp|mp4)\b/i;

export function isExplicitGifRequest(text: string): boolean {
  return EXPLICIT_GIF_RE.test(text) || IMAGE_EXT_RE.test(text);
}

const MENTION_OR_URL_RE =
  /<@!?(\d+)>|<@&(\d+)>|https?:\/\/\S+|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
const GARBAGE_RE = /[^\p{L}\p{N}\s]/gu;

// 剝掉 mention / URL / 表情 / 標點 / 要圖字眼 / 圖片副檔名，回傳乾淨的搜尋關鍵字；
// 若清完不是有效的關鍵字（<2 個中英文字）則回 null。
export function cleanGifQuery(text: string): string | null {
  const cleaned = text
    .replace(MENTION_OR_URL_RE, " ")
    .replace(IMAGE_EXT_RE, " ")
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