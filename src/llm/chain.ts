import { llm } from "./client.js";
import { config } from "../config.js";
import type { StoredMessage } from "../services/message-store.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ChainResult {
  isQuote: boolean;
  reply: string;
}

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "chain.txt"),
  "utf-8",
);

const OUTPUT_FORMAT = `
{
  "is_quote": true,
  "reply": "下一句／下一段"
}`;

export async function chainReply(
  messageText: string,
  recentMessages: StoredMessage[],
): Promise<ChainResult> {
  const context = recentMessages
    .slice(-10)
    .map((m) => `<${m.userId}> ${m.content}`)
    .join("\n");

  const userContent = `最近的對話（供辨識是否已是接力中）:\n${context || "（無）"}\n\n使用者剛貼的訊息:\n${messageText}`;

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
  if (!content) return { isQuote: false, reply: "" };

  try {
    const jsonStr = content
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    const raw = JSON.parse(jsonStr);
    const isQuote = raw.is_quote === true;
    const reply = String(raw.reply ?? "").trim();
    return { isQuote, reply };
  } catch (error) {
    console.error("[LLM] Failed to parse chain response:", content.slice(0, 300));
    return { isQuote: false, reply: "" };
  }
}