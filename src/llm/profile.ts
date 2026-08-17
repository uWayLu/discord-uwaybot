import { llm } from "./client.js";
import { getModel } from "./model-router.js";
import type { StoredMessage } from "../services/message-store.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface UserProfile {
  tone: string;
  style_features: string[];
  catchphrases: string[];
  particles: string[];
  emoji_habits: string;
  topics: string[];
  reply_length: string;
  punctuation: string;
  typical_style_sample: string;
}

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "profile.txt"),
  "utf-8",
);

const OUTPUT_FORMAT = `
{
  "tone": "整體語氣描述",
  "style_features": ["用字習慣特徵"],
  "catchphrases": ["口頭禪"],
  "particles": ["常見語助詞"],
  "emoji_habits": "表情/貼圖使用習慣",
  "topics": ["常見話題"],
  "reply_length": "典型回覆長度描述",
  "punctuation": "標點/用字習慣",
  "typical_style_sample": "最能代表其風格的範例"
}`;

function sampleMessages(messages: StoredMessage[], max: number): StoredMessage[] {
  const valid = messages.filter((m) => m.content.trim().length > 0);
  if (valid.length <= max) return valid;
  const step = valid.length / max;
  const sampled: StoredMessage[] = [];
  for (let i = 0; i < max; i++) {
    sampled.push(valid[Math.floor(i * step)]!);
  }
  return sampled;
}

export async function generateProfile(
  messages: StoredMessage[],
): Promise<UserProfile> {
  const sampled = sampleMessages(messages, 300);
  const body = sampled
    .map((m) => {
      const time = new Date(m.createdAt).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
        month: "2-digit",
        day: "2-digit",
      });
      return `[${time}] ${m.content}`;
    })
    .join("\n");

  const userContent = `以下是一位使用者在 Discord 上的 ${sampled.length} 則訊息：\n\n${body}`;

  const response = await llm.chat.completions.create({
    model: getModel("core"),
    messages: [
      { role: "system", content: systemPrompt + OUTPUT_FORMAT },
      { role: "user", content: userContent },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("profile: empty response");
  }

  try {
    const jsonStr = content
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    const raw = JSON.parse(jsonStr);
    return {
      tone: raw.tone ?? "樣本不足，無法判斷",
      style_features: Array.isArray(raw.style_features) ? raw.style_features : [],
      catchphrases: Array.isArray(raw.catchphrases) ? raw.catchphrases : [],
      particles: Array.isArray(raw.particles) ? raw.particles : [],
      emoji_habits: raw.emoji_habits ?? "樣本不足，無法判斷",
      topics: Array.isArray(raw.topics) ? raw.topics : [],
      reply_length: raw.reply_length ?? "樣本不足，無法判斷",
      punctuation: raw.punctuation ?? "樣本不足，無法判斷",
      typical_style_sample: raw.typical_style_sample ?? "",
    };
  } catch (e) {
    console.error("[LLM] Failed to parse profile response:", content.slice(0, 300));
    throw new Error("profile: failed to parse response");
  }
}
