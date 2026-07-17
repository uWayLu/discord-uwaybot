import { llm } from "./client.js";
import { config } from "../config.js";
import type { StoredMessage } from "../services/message-store.js";
import { formatMessagesForLLM } from "../services/context-builder.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SearchResult = {
  total_mentions: number;
  summary: string;
  results: Array<{
    summary: string;
    original: string;
    userId: string;
    timestamp: string;
  }>;
};

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "search.txt"),
  "utf-8",
);

const OUTPUT_FORMAT = `

你必須嚴格回覆以下 JSON 格式，不要加入其他文字：
{
  "total_mentions": 5,
  "summary": "整體搜尋摘要",
  "results": [
    {
      "summary": "該訊息的摘要",
      "original": "原訊息內容",
      "userId": "user_id",
      "timestamp": "時間"
    }
  ]
}`;

export async function searchMessages(
  messages: StoredMessage[],
  query: string,
): Promise<SearchResult> {
  const formatted = formatMessagesForLLM(messages);

  const userContent = `使用者查詢: ${query}\n\n訊息內容:\n${formatted}`;

  const t0 = Date.now();
  const response = await llm.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt + OUTPUT_FORMAT },
      { role: "user", content: userContent },
    ],
  });
  console.log(`[LLM] search call took ${Date.now() - t0}ms`);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { total_mentions: 0, summary: "", results: [] };
  }

  try {
    const jsonStr = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const raw = JSON.parse(jsonStr);
    const results = (raw.results ?? []).map((r: any) => ({
      summary: r.summary ?? "",
      original: r.original ?? "",
      userId: r.userId ?? r.user_id ?? "",
      timestamp: r.timestamp ?? "",
    }));
    return {
      total_mentions: raw.total_mentions ?? results.length,
      summary: raw.summary ?? "",
      results,
    };
  } catch (e) {
    console.error("[LLM] Failed to parse search response:", content.slice(0, 300));
    return { total_mentions: 0, summary: "", results: [] };
  }
}
