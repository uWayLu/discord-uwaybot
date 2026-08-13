import type { Message } from "discord.js";
import { config } from "../config.js";
import { isExplicitGifRequest } from "../utils/gif.js";

const QUESTION_RE = /[？?]|嗎|呢|麻|怎麼|為何|為什麼|啥|覺不覺得|會怎麼|是吧|是嗎|你覺得/;

const lastChannelReply = new Map<string, number>();
const lastUserReply = new Map<string, number>();

const targets = new WeakMap<Message, { score: number }>();

export function isBotRoleMentioned(message: Message): boolean {
  const clientUser = message.client.user;
  if (!clientUser) return false;
  return message.mentions.roles.some((role) => role.members.has(clientUser.id));
}

export function isDirectlyAddressed(message: Message): boolean {
  const clientUser = message.client.user;
  if (!clientUser) return false;

  const content = message.content;
  const trimmed = content.trim();
  const mentionToken = `<@${clientUser.id}>`;
  const mentionToken2 = `<@!${clientUser.id}>`;

  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  const lastToken = trimmed.split(/\s+/).slice(-1)[0] ?? "";
  const isFirstBot = firstToken === mentionToken || firstToken === mentionToken2;
  const isLastBot = lastToken === mentionToken || lastToken === mentionToken2;

  return isFirstBot || isLastBot || isBotRoleMentioned(message);
}

export function scoreMention(message: Message, replyIsBot: boolean): number {
  const clientUser = message.client.user;
  if (!clientUser) return 0;

  const content = message.content;
  const trimmed = content.trim();
  const mentionToken = `<@${clientUser.id}>`;
  const mentionToken2 = `<@!${clientUser.id}>`;
  const clean = content.replace(/<@!?\d+>/g, " ").replace(/\s+/g, " ").trim();

  let score = 0;
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  const lastToken = trimmed.split(/\s+/).slice(-1)[0] ?? "";
  const isFirstBot = firstToken === mentionToken || firstToken === mentionToken2;
  const isLastBot = lastToken === mentionToken || lastToken === mentionToken2;

  if (isFirstBot || isLastBot) score += 3; // 直接點名 → 必回
  if (isBotRoleMentioned(message)) score += 3; // role 包含 bot → 也算點名

  if (replyIsBot) score += 3;

  const otherHumans = [...(message.mentions.members?.values() ?? [])].filter(
    (m) => m.id !== clientUser.id && m.id !== message.author.id,
  ).length;
  if (otherHumans === 0) score += 1;
  if (otherHumans > 1) score -= 1;

  if (!isFirstBot && !isLastBot && content.includes(mentionToken)) {
    score -= 1; // 句中提及 → 第三人稱機率較高
  }

  if (!QUESTION_RE.test(clean) && !isFirstBot && !replyIsBot) {
    score -= 0.5; // 陳述句、非開頭提及、非引用 → 不算點名
  }

  targets.set(message, { score });
  return score;
}

export function shouldRespond(message: Message, replyIsBot: boolean): boolean {
  if (replyIsBot) return true;

  const cached = targets.get(message);
  const score = cached?.score ?? scoreMention(message, replyIsBot);

  const c = config.directed;
  // 明確點名（高分）→ 一定回，不要偶爾漏掉
  if (score >= c.thresholdHigh) return true;

  let p: number;
  if (score >= c.thresholdMid) p = c.pMid;
  else p = c.pLow;

  return Math.random() < p;
}

export function cooldownAllowed(message: Message): boolean {
  const now = Date.now();
  const c = config.directed;

  const lastCh = lastChannelReply.get(message.channelId) ?? 0;
  const lastUsr = lastUserReply.get(message.author.id) ?? 0;

  return (
    now - lastCh >= c.cooldownChannelMs && now - lastUsr >= c.cooldownUserMs
  );
}

function consumeCooldown(message: Message): void {
  const now = Date.now();
  lastChannelReply.set(message.channelId, now);
  lastUserReply.set(message.author.id, now);
}

export function gateMention(message: Message, replyIsBot: boolean): boolean {
  if (!cooldownAllowed(message)) return false;
  // 明確要圖 → 無論位置都觸發（句中 @bot 也要能出 GIF）
  if (isExplicitGifRequest(message.content)) {
    consumeCooldown(message);
    return true;
  }
  if (!shouldRespond(message, replyIsBot)) return false;
  consumeCooldown(message);
  return true;
}