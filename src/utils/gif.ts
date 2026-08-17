import { config } from "../config.js";
import { selectMeme } from "../llm/meme-select.js";

/**
 * 從 memes.tw 熱門 feed 挑一張語意最符合 query 的梗圖，回傳其網址；
 * 無符合或失敗回傳空陣列。
 */
export async function searchGif(query: string): Promise<string[]> {
  if (!query.trim()) return [];

  let url = "https://memes.tw/wtf/api";
  if (config.gif.contest) {
    url += `?contest=${encodeURIComponent(config.gif.contest)}`;
  }

  let json: unknown;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "discord-uwaybot" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn("[GIF] MEMES.TW HTTP", res.status);
      return [];
    }
    json = await res.json();
  } catch (e) {
    console.error("[GIF] MEMES.TW error:", (e as Error).message);
    return [];
  }

  const list = Array.isArray(json) ? json : [];
  const srcById = new Map<number, string>();
  const candidates: Array<{
    id: number;
    title: string;
    hashtag: string;
    contest: string;
  }> = [];

  for (const item of list) {
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

  const chosen = await selectMeme(query, candidates, srcById);
  return chosen ? [chosen] : [];
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
