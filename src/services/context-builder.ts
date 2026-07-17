import type { StoredMessage } from "./message-store.js";

export interface ContextResult {
  messages: StoredMessage[];
  source: "reply" | "thread" | "recent活跃" | "fallback";
}

export function buildOpinionContext(
  allMessages: StoredMessage[],
  repliedMessageId?: string | null,
  threadId?: string | null,
  limit: number = 30,
): ContextResult {
  if (repliedMessageId) {
    const replyIdx = allMessages.findIndex((m) => m.id === repliedMessageId);
    if (replyIdx !== -1) {
      const context = allMessages.slice(
        Math.max(0, replyIdx - 5),
        Math.min(allMessages.length, replyIdx + limit),
      );
      return { messages: context, source: "reply" };
    }
  }

  if (threadId) {
    const threadMsgs = allMessages.filter((m) => m.threadId === threadId);
    if (threadMsgs.length > 0) {
      return {
        messages: threadMsgs.slice(-limit),
        source: "thread",
      };
    }
  }

  const recentMsgs = allMessages.slice(-limit);
  return { messages: recentMsgs, source: "fallback" };
}

export function formatMessagesForLLM(msgs: StoredMessage[]): string {
  return msgs
    .map((m) => {
      const time = new Date(m.createdAt).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `[${time}] <${m.userId}> ${m.content}`;
    })
    .join("\n");
}
