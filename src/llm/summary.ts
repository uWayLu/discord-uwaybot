import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { llm } from "./client.js";
import { config } from "../config.js";
import type { Topic } from "../services/topic-detector.js";
import { formatMessagesForLLM } from "../services/context-builder.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SummarySchema = z.object({
  topics: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      participants: z.array(z.string()),
      decisions: z.array(z.string()),
      open_questions: z.array(z.string()),
    }),
  ),
});

export type SummaryResult = z.infer<typeof SummarySchema>;

const systemPrompt = readFileSync(
  join(import.meta.dirname, "..", "prompts", "summary.txt"),
  "utf-8",
);

export async function summarizeTopics(topics: Topic[]): Promise<SummaryResult> {
  const topicBlocks = topics.map((t, i) => {
    const msgs = formatMessagesForLLM(t.messages);
    return `=== 主題 ${i + 1} ===\n${msgs}`;
  });

  const userContent = topicBlocks.join("\n\n");

  const t0 = Date.now();
  const response = await llm.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(SummarySchema, "summary"),
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
