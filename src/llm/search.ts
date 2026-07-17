import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { llm } from "./client.js";
import { config } from "../config.js";
import type { StoredMessage } from "../services/message-store.js";
import { formatMessagesForLLM } from "../services/context-builder.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SearchSchema = z.object({
  results: z.array(
    z.object({
      summary: z.string(),
      original: z.string(),
      userId: z.string(),
      timestamp: z.string(),
    }),
  ),
});

export type SearchResult = z.infer<typeof SearchSchema>;

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "search.txt"),
  "utf-8",
);

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
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(SearchSchema, "search"),
  });
  console.log(`[LLM] search call took ${Date.now() - t0}ms`);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { results: [] };
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
    return { results };
  } catch (e) {
    console.error("[LLM] Failed to parse search response:", content.slice(0, 300));
    return { results: [] };
  }
}
