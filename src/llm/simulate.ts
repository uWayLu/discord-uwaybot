import { llm } from "./client.js";
import { config } from "../config.js";
import type { StoredMessage } from "../services/message-store.js";
import type { UserProfile } from "./profile.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SimulateResult {
  predicted_reply: string;
  confidence: number;
  matched_style_features: string[];
}

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "simulate.txt"),
  "utf-8",
);

const OUTPUT_FORMAT = `
{
  "predicted_reply": "以該使用者風格預測的回覆",
  "confidence": 0.7,
  "matched_style_features": ["命中的風格特徵"]
}`;

export async function predictReply(
  profile: UserProfile,
  contextMessages: StoredMessage[],
  exampleMessages: StoredMessage[],
): Promise<SimulateResult> {
  const context = contextMessages
    .map((m) => `<${m.userId}> ${m.content}`)
    .join("\n");

  const examples = exampleMessages
    .map((m) => m.content)
    .filter((c) => c.trim().length > 0)
    .slice(0, 10)
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const userContent = `## 使用者畫像\n${JSON.stringify(profile, null, 2)}\n\n## 目前的對話上下文（最後一則之後由你預測回覆）\n${context}\n\n## 該使用者的過去類似訊息範例\n${examples}\n\n請預測該使用者接下來最可能說的一句話。`;

  const response = await llm.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt + OUTPUT_FORMAT },
      { role: "user", content: userContent },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("simulate: empty response");
  }

  try {
    const jsonStr = content
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    const raw = JSON.parse(jsonStr);
    return {
      predicted_reply: String(raw.predicted_reply ?? raw.reply ?? raw.text ?? ""),
      confidence:
        typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
      matched_style_features: Array.isArray(raw.matched_style_features)
        ? raw.matched_style_features
        : [],
    };
  } catch (e) {
    console.error("[LLM] Failed to parse simulate response:", content.slice(0, 300));
    throw new Error("simulate: failed to parse response");
  }
}
