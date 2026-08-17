import { llm } from "./client.js";
import { getActiveModel } from "./model-router.js";
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

const questionSystemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "simulate-question.txt"),
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

  const userContent = `## 使用者畫像\n${JSON.stringify(profile, null, 2)}\n\n## 強制風格指南（優先於一般描述，逐字沿用）\n${buildStyleGuide(profile)}\n\n## 目前的對話上下文（最後一則之後由你預測回覆）\n${context}\n\n## 該使用者的過去類似訊息範例\n${formatExamples(exampleMessages)}\n\n請預測該使用者接下來最可能說的一句話。`;

  return callSimulate(systemPrompt, userContent);
}

export async function predictOpinion(
  profile: UserProfile,
  question: string,
  contextMessages: StoredMessage[],
  exampleMessages: StoredMessage[],
  nameMap?: Map<string, string>,
): Promise<SimulateResult> {
  const context = contextMessages
    .map((m) => {
      const name = nameMap?.get(m.userId) ?? m.userId;
      return `<${name}> ${m.content}`;
    })
    .join("\n");

  const userContent = `你正在模仿的對象畫像\n${JSON.stringify(profile, null, 2)}\n\n## 強制風格指南（優先於一般描述，逐字沿用）\n${buildStyleGuide(profile)}\n\n## 目前的對話內容\n${context}\n\n## 該使用者的過去類似訊息範例\n${formatExamples(exampleMessages)}\n\n## 問題\n${question}\n\n請以被模仿使用者的身份回答上述問題。`;

  return callSimulate(questionSystemPrompt, userContent);
}

function buildStyleGuide(profile: UserProfile): string {
  const particles = (profile.particles ?? []).filter((x) => x.trim());
  const catchphrases = (profile.catchphrases ?? []).filter((x) => x.trim());
  const emojis = (profile.emoji_habits?.match(/<:[^>]+>|\p{Extended_Pictographic}/gu) ?? [])
    .slice(0, 3)
    .join(" ");

  const lines: string[] = [];
  if (profile.tone) lines.push(`- 性格／一貫立場（persona，語氣照此）: ${profile.tone}`);
  if (profile.topics?.length) lines.push(`- 慣常話題: ${profile.topics.join("；")}`);
  if (particles.length)
    lines.push(`- 句尾語助詞（必須至少用一個並逐字保留，不可改成標準語）: ${particles.join("、")}`);
  if (profile.punctuation)
    lines.push(`- 標點／用字習慣（盡量照此呈現，不要改成端正書面語）: ${profile.punctuation}`);
  if (catchphrases.length)
    lines.push(`- 口頭詞（可擇一自然帶入）: ${catchphrases.join("、")}`);
  if (emojis) lines.push(`- 表情標籤（語氣處可點綴）: ${emojis}`);
  if (profile.reply_length)
    lines.push(`- 回覆長度（依此塑型，不要超出）: ${profile.reply_length}`);
  return lines.join("\n") || "（無額外風格資訊）";
}

function formatExamples(exampleMessages: StoredMessage[]): string {
  return exampleMessages
    .map((m) => m.content)
    .filter((c) => c.trim().length > 0)
    .slice(0, 10)
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
}

async function callSimulate(
  systemPrompt: string,
  userContent: string,
): Promise<SimulateResult> {
  const response = await llm.chat.completions.create({
    model: getActiveModel(),
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
