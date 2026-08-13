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

function extractGifUrls(json: any): string[] {
  const urls = new Set<string>();

  const pushUrl = (v: unknown) => {
    if (typeof v === "string" && /\.(gif|mp4)(\?.*)?$/i.test(v)) urls.add(v);
  };

  const walk = (node: any, depth = 0) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node === "object") {
      const keys = Object.keys(node);
      // 優先取名含 gif 的欄位，其次直接掃 URL
      for (const k of keys) {
        if (/^gif$/i.test(k)) pushUrl(node[k]);
      }
      for (const k of keys) {
        if (/url/i.test(k)) pushUrl(node[k]);
      }
      for (const k of keys) {
        if (typeof node[k] === "object") walk(node[k], depth + 1);
      }
    }
  };

  walk(json);
  return [...urls];
}

const EXPLICIT_GIF_RE =
  /(梗圖|來張圖|丟張圖|來點圖|來張梗圖|丟張梗圖|來張gif|來張表情包|表情包|gif|圖片|meme|梗|張圖|給圖|來圖)/i;

export function isExplicitGifRequest(text: string): boolean {
  return EXPLICIT_GIF_RE.test(text);
}