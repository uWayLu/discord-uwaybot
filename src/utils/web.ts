const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function fetchUrl(url: string): Promise<{ title: string; content: string; error?: string }> {
  try {
    const isPtt = url.includes("ptt.cc");
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
    };
    if (isPtt) {
      headers["Cookie"] = "over18=1";
    }

    const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return { title: "", content: "", error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    return parseHtml(html, url);
  } catch (e: any) {
    return { title: "", content: "", error: e.message ?? "fetch failed" };
  }
}

function parseHtml(html: string, url: string): { title: string; content: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";

  let content: string;

  if (url.includes("ptt.cc")) {
    content = parsePtt(html);
  } else if (url.includes("x.com") || url.includes("twitter.com")) {
    content = parseTwitter(html);
  } else {
    content = parseGeneric(html);
  }

  return { title, content: content.slice(0, 8000) };
}

function parsePtt(html: string): string {
  const mainMatch = html.match(/<div[^>]*id="main-content"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="article-metaline"/i)
    ?? html.match(/<div[^>]*id="main-content"[^>]*>([\s\S]*?)<\/div>/i);
  if (!mainMatch) return stripTags(html).slice(0, 8000);

  let text = mainMatch[1] ?? "";
  text = text.replace(/<span[^>]*class="article-meta-tag"[^>]*>[\s\S]*?<\/span>/gi, "");
  text = text.replace(/<span[^>]*class="article-meta-value"[^>]*>[\s\S]*?<\/span>/gi, "");
  text = text.replace(/<div[^>]*class="article-metaline-right"[^>]*>[\s\S]*?<\/div>/gi, "");
  return stripTags(text).trim().slice(0, 8000);
}

function parseTwitter(html: string): string {
  const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i);
  return descMatch?.[1] ?? stripTags(html).slice(0, 8000);
}

function parseGeneric(html: string): string {
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    ?? html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const target = articleMatch?.[1] ?? html;
  return stripTags(target).replace(/\s+/g, " ").trim().slice(0, 8000);
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ");
}

export function extractUrls(text: string): string[] {
  const urlRe = /https?:\/\/[^\s<>"')\]]+/g;
  const matches = text.match(urlRe) ?? [];
  return [...new Set(matches)];
}
