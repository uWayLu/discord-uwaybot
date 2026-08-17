import { llm } from "./client.js";
import { getModel } from "./model-router.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface WebDoc {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

export interface ReferenceResult {
  shouldReply: boolean;
  reply: string;
  source: string;
  gifQuery: string;
}

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "reference.txt"),
  "utf-8",
);

const OUTPUT_FORMAT = `
{
  "shouldReply": true,
  "reply": "回應內容",
  "source": "出自哪部作品／哪個梗",
  "gifQuery": "要搜 GIF 的關鍵字（非視覺梗則為空字串）"
}`;

export async function referenceReply(
  question: string,
  authorName: string,
  webDocs: WebDoc[],
): Promise<ReferenceResult> {
  const docs = webDocs
    .map((d, i) => {
      const c = d.content ? `\n內文:\n${d.content.slice(0, 3000)}` : "";
      return `[${i + 1}] ${d.title}\n${d.url}\n摘要: ${d.snippet}${c}`;
    })
    .join("\n\n");

  const userContent = `呼叫者顯示名: ${authorName}\n\n使用者的訊息:\n${question}\n\n網路搜尋結果與內文:\n${docs || "（無搜尋結果）"}\n\n請依上述資料判斷是否為捏他／迷因／名句並回應。`;

  const t0 = Date.now();
  const response = await llm.chat.completions.create({
    model: getModel("light"),
    messages: [
      { role: "system", content: systemPrompt + OUTPUT_FORMAT },
      { role: "user", content: userContent },
    ],
  });
  console.log(`[LLM] reference call took ${Date.now() - t0}ms (len ${question.length})`);

  const content = response.choices[0]?.message?.content;
  if (!content) return { shouldReply: false, reply: "", source: "", gifQuery: "" };

  try {
    const jsonStr = content
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    const raw = JSON.parse(jsonStr);
    return {
      shouldReply: raw.shouldReply === true,
      reply: String(raw.reply ?? "").trim(),
      source: String(raw.source ?? "").trim(),
      gifQuery: String(raw.gifQuery ?? "").trim(),
    };
  } catch (error) {
    console.error("[LLM] Failed to parse reference response:", content.slice(0, 300));
    return { shouldReply: false, reply: "", source: "", gifQuery: "" };
  }
}