import { llm } from "./client.js";
import { config } from "../config.js";
import type { StoredMessage } from "../services/message-store.js";
import { formatMessagesForLLM } from "../services/context-builder.js";
import { loadPrompt } from "../prompts/loader.js";

export type OpinionResult = {
  opinion: string;
  references: string[];
  confidence: number;
};

const systemPrompt = loadPrompt("opinion.txt");

const OUTPUT_FORMAT = `

你必須嚴格回覆以下 JSON 格式，不要加入其他文字：
{
  "opinion": "你的回應內容",
  "references": ["參考的訊息摘要"],
  "confidence": 0.8
}`;

export async function getOpinion(
  contextMessages: StoredMessage[],
  userQuestion: string,
  webContent: string = "",
  nameMap?: Map<string, string>,
  ragBlock?: string,
): Promise<OpinionResult> {
  const formattedContext = formatMessagesForLLM(contextMessages, nameMap);

  let userContent = `對話上下文:\n${formattedContext}\n\n使用者問題: ${userQuestion}`;
  if (webContent) {
    userContent += `\n\n以下是使用者提到的網頁內容:\n${webContent}`;
  }
  if (ragBlock) {
    userContent += `\n\n${ragBlock}`;
  }
  console.log("[LLM] opinion user content length:", userContent.length, "webContent:", webContent ? `${webContent.length} chars` : "none");

  const t0 = Date.now();
  const response = await llm.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt + OUTPUT_FORMAT },
      { role: "user", content: userContent },
    ],
  });
  console.log(`[LLM] opinion call took ${Date.now() - t0}ms`);

  const content = response.choices[0]?.message?.content;
  console.log("[LLM] opinion raw content:", content?.slice(0, 300));
  if (!content) {
    return {
      opinion: "抱歉，我無法產生回應。",
      references: [],
      confidence: 0,
    };
  }

  try {
    const jsonStr = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const raw = JSON.parse(jsonStr);
    const opinion = raw.opinion ?? raw.response ?? raw.text ?? raw.content ?? Object.values(raw).find((v) => typeof v === "string") ?? "";
    return {
      opinion: String(opinion),
      references: raw.references ?? [],
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
    };
  } catch {
    console.error("[LLM] Failed to parse opinion response:", content.slice(0, 300));
    return {
      opinion: "抱歉，回應格式解析失敗。",
      references: [],
      confidence: 0,
    };
  }
}
