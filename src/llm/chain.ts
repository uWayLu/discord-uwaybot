import { llm } from "./client.js";
import { config } from "../config.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ChainResult {
  isQuote: boolean;
  reply: string;
  source: string;
}

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "chain.txt"),
  "utf-8",
);

const OUTPUT_FORMAT = `
{
  "is_quote": true,
  "reply": "下一句／下一段",
  "source": "出自哪部作品或來源"
}`;

export async function chainReply(
  messageText: string,
  searchResults: Array<{ title: string; url: string; snippet: string }>,
): Promise<ChainResult> {
  const snippets = searchResults
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join("\n\n");

  const userContent = `使用者的訊息（疑似台詞／咒文／歌詞）:\n${messageText}\n\n網路搜尋結果:\n${snippets || "（無搜尋結果）"}\n\n請依據上述搜尋結果判斷並接出正確的下一句。`;

  const t0 = Date.now();
  const response = await llm.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt + OUTPUT_FORMAT },
      { role: "user", content: userContent },
    ],
  });
  console.log(`[LLM] chain call took ${Date.now() - t0}ms (len ${messageText.length})`);

  const content = response.choices[0]?.message?.content;
  if (!content) return { isQuote: false, reply: "", source: "" };

  try {
    const jsonStr = content
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    const raw = JSON.parse(jsonStr);
    return {
      isQuote: raw.is_quote === true,
      reply: String(raw.reply ?? "").trim(),
      source: String(raw.source ?? "").trim(),
    };
  } catch (error) {
    console.error("[LLM] Failed to parse chain response:", content.slice(0, 300));
    return { isQuote: false, reply: "", source: "" };
  }
}