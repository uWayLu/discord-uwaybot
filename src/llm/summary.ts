import { llm } from "./client.js";
import { getActiveModel } from "./model-router.js";
import type { Topic } from "../services/topic-detector.js";
import { formatMessagesForLLM } from "../services/context-builder.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SummaryResult = {
  topics: Array<{
    title: string;
    summary: string;
    participants: string[];
    decisions: string[];
    open_questions: string[];
  }>;
};

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "summary.txt"),
  "utf-8",
);

const OUTPUT_FORMAT = `

你必須嚴格回覆以下 JSON 格式，不要加入其他文字：
{
  "topics": [
    {
      "title": "主題標題",
      "summary": "一句話摘要",
      "participants": ["user_id"],
      "decisions": ["已做出的決定"],
      "open_questions": ["未解的問題"]
    }
  ]
}`;

export async function summarizeTopics(topics: Topic[]): Promise<SummaryResult> {
  const topicBlocks = topics.map((t, i) => {
    const msgs = formatMessagesForLLM(t.messages);
    return `=== 主題 ${i + 1} ===\n${msgs}`;
  });

  const userContent = topicBlocks.join("\n\n");

  const t0 = Date.now();
  const response = await llm.chat.completions.create({
    model: getActiveModel(),
    messages: [
      { role: "system", content: systemPrompt + OUTPUT_FORMAT },
      { role: "user", content: userContent },
    ],
  });
  console.log(`[LLM] summary call took ${Date.now() - t0}ms`);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { topics: [] };
  }

  try {
    const jsonStr = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const raw = JSON.parse(jsonStr);
    const topics = (raw.topics ?? []).map((t: any) => ({
      title: t.title ?? "Untitled",
      summary: t.summary ?? "",
      participants: t.participants ?? [],
      decisions: t.decisions ?? [],
      open_questions: t.open_questions ?? t.unresolved_questions ?? t.questions ?? [],
    }));
    return { topics };
  } catch (e) {
    console.error("[LLM] Failed to parse summary response:", content.slice(0, 300));
    return { topics: [] };
  }
}
