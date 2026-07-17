import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { llm } from "./client.js";
import { config } from "../config.js";
import type { StoredMessage } from "../services/message-store.js";
import { formatMessagesForLLM } from "../services/context-builder.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OpinionSchema = z.object({
  opinion: z.string(),
  references: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type OpinionResult = z.infer<typeof OpinionSchema>;

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "opinion.txt"),
  "utf-8",
);

export async function getOpinion(
  contextMessages: StoredMessage[],
  userQuestion: string,
): Promise<OpinionResult> {
  const formattedContext = formatMessagesForLLM(contextMessages);

  const userContent = `對話上下文:\n${formattedContext}\n\n使用者問題: ${userQuestion}`;

  const response = await llm.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(OpinionSchema, "opinion"),
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return {
      opinion: "抱歉，我無法產生回應。",
      references: [],
      confidence: 0,
    };
  }

  try {
    const parsed = OpinionSchema.parse(JSON.parse(content));
    return parsed;
  } catch {
    console.error("[LLM] Failed to parse opinion response");
    return {
      opinion: "抱歉，回應格式解析失敗。",
      references: [],
      confidence: 0,
    };
  }
}
