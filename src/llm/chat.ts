import { llm } from "./client.js";
import { config } from "../config.js";
import type { StoredMessage } from "../services/message-store.js";
import type { UserProfile } from "./profile.js";
import type { ChatTurn } from "../services/chat-session.js";
import type { ChatMode } from "../utils/chat-mode.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadPrompt(file: string): string {
  return readFileSync(join(import.meta.dirname, "..", "prompts", file), "utf-8");
}

const systemPrompt = loadPrompt("chat.txt");
const systemPromptMedium = loadPrompt("chat-medium.txt");

export interface ChatReply {
  content: string;
  messageIndex: number | null;
}

export interface ChatResult {
  replies: ChatReply[];
}

const OUTPUT_FORMAT = `
{
  "replies": [
    { "content": "回覆內容", "messageIndex": 2 }
  ]
}`;

export async function chatReply(
  contextMessages: StoredMessage[],
  question: string,
  nameMap?: Map<string, string>,
  impersonation?: { name: string; profile?: UserProfile } | null,
  sessionTurns: ChatTurn[] = [],
  mode: ChatMode = "short",
): Promise<ChatResult> {
  const prompt = mode === "medium" ? systemPromptMedium : systemPrompt;
  const labeled = contextMessages.map((m, i) => {
    const name = nameMap?.get(m.userId) ?? m.userId;
    return `[${i}] <${name}> ${m.content}`;
  });
  const context = labeled.join("\n");

  let userContent = `最近的對話上下文（[索引] 放在句首）:\n${context}\n\n使用者的訊息: ${question}`;

  if (impersonation) {
    userContent += `\n\n## 模仿對象畫像（使用者似乎在問「${impersonation.name}會怎麼說」）\n${impersonation.profile ? JSON.stringify(impersonation.profile, null, 2) : "${impersonation.name} 目前沒有風格畫像。"}`;
  }
  console.log("[LLM] chat user content length:", userContent.length);

  const t0 = Date.now();
  const response = await llm.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: prompt + OUTPUT_FORMAT },
      ...sessionTurns,
      { role: "user", content: userContent },
    ],
  });
  console.log(`[LLM] chat call took ${Date.now() - t0}ms`);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { replies: [{ content: "抱歉，我沒讀懂這裡在聊什麼。", messageIndex: null }] };
  }

  try {
    const jsonStr = content
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    const raw = JSON.parse(jsonStr);
    const rawReplies = Array.isArray(raw.replies)
      ? raw.replies
      : [{ content: raw.replies ?? raw.content ?? raw, messageIndex: null }];

    const replies = rawReplies
      .map((r: { content?: unknown; messageIndex?: unknown }) => {
        const contentText = typeof r?.content === "string" ? r.content : null;
        if (!contentText || !contentText.trim()) return null;
        if (typeof r === "string") return { content: r, messageIndex: null };
        return {
          content: contentText,
          messageIndex:
            typeof r.messageIndex === "number" &&
            r.messageIndex >= 0 &&
            r.messageIndex < contextMessages.length
              ? r.messageIndex
              : null,
        };
      })
      .filter((r: ChatReply | null): r is ChatReply => r !== null);

    if (replies.length === 0) {
      return {
        replies: [{ content: "抱歉，我沒讀懂這裡在聊什麼。", messageIndex: null }],
      };
    }
    return { replies };
  } catch (error) {
    console.error("[LLM] Failed to parse chat response:", content.slice(0, 300));
    return {
      replies: [{ content: "抱歉，我沒讀懂這裡在聊什麼。", messageIndex: null }],
    };
  }
}