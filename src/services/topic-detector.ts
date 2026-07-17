import type { StoredMessage } from "./message-store.js";

export interface Topic {
  title: string;
  messages: StoredMessage[];
  startedAt: number;
  endedAt: number;
}

export function detectTopics(
  msgs: StoredMessage[],
  gapMinutes: number = 10,
): Topic[] {
  if (msgs.length === 0) return [];

  const topics: Topic[] = [];
  let current: StoredMessage[] = [msgs[0]!];
  const gapMs = gapMinutes * 60 * 1000;

  for (let i = 1; i < msgs.length; i++) {
    const prev = msgs[i - 1]!;
    const curr = msgs[i]!;

    const timeGap = curr.createdAt - prev.createdAt;
    const isNewThread = curr.threadId && curr.threadId !== prev.threadId;
    const isReplyBreak = curr.replyTo && curr.replyTo !== prev.id && !prev.replyTo;

    const shouldSplit = timeGap > gapMs || isNewThread || isReplyBreak;

    if (shouldSplit) {
      topics.push(buildTopic(current));
      current = [curr];
    } else {
      current.push(curr);
    }
  }

  topics.push(buildTopic(current));
  return topics;
}

function buildTopic(msgs: StoredMessage[]): Topic {
  const title = generateTopicTitle(msgs);
  return {
    title,
    messages: msgs,
    startedAt: msgs[0]!.createdAt,
    endedAt: msgs[msgs.length - 1]!.createdAt,
  };
}

function generateTopicTitle(msgs: StoredMessage[]): string {
  const nonSystem = msgs.filter(
    (m) => !m.content.startsWith("/") && m.content.trim().length > 0,
  );

  if (nonSystem.length === 0) return "未命名主題";

  const firstMsg = nonSystem[0]!;
  const preview = firstMsg.content.slice(0, 40).replace(/\n/g, " ");
  return preview.length < firstMsg.content.length ? `${preview}…` : preview;
}
