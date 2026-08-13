import { Events } from "discord.js";
import type { Message, TextChannel } from "discord.js";
import { storeMessage, getRecentMessages, getMessageById } from "../services/message-store.js";
import { upsertUser } from "../services/user-store.js";
import { getProfile } from "../services/profile-store.js";
import { buildOpinionContext } from "../services/context-builder.js";
import { gateMention, isBotRoleMentioned } from "../services/directed-gate.js";
import { config } from "../config.js";
import { chatReply } from "../llm/chat.js";
import { referenceReply } from "../llm/reference.js";
import { searchWithContent } from "../utils/web.js";
import { searchGif, isExplicitGifRequest, cleanGifQuery, isValidGifKeyword } from "../utils/gif.js";
import { gifKeyword } from "../llm/gif-keyword.js";

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message: Message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    try {
      const ch = message.channel;
      const threadId =
        "threadId" in ch ? String(ch.threadId ?? "") || null : null;

      await storeMessage({
        id: message.id,
        guildId: message.guild.id,
        channelId: message.channelId,
        threadId,
        userId: message.author.id,
        content: message.content,
        createdAt: message.createdTimestamp,
        replyTo: message.reference?.messageId ?? null,
        hasEmbed: message.embeds.length > 0,
      });

      const displayName =
        message.member?.displayName ?? message.author.username ?? message.author.id;
      await upsertUser({
        id: message.author.id,
        guildId: message.guild.id,
        displayName,
      });

      const clientUser = message.client.user;
      const botMentioned =
        (clientUser != null && message.mentions.has(clientUser)) ||
        isBotRoleMentioned(message);
      if (!botMentioned) return;

      await handleMention(message);
    } catch (error) {
      console.error("[MSG] Error handling message:", error);
    }
  },
};

async function handleMention(message: Message) {
  try {
    const replyIsBot = await isReplyToBot(message);

    if (!gateMention(message, replyIsBot)) return;

    if ("sendTyping" in message.channel) {
      await (message.channel as TextChannel).sendTyping().catch(() => {});
    }

    const recentMessages = await getRecentMessages(message.channelId, 100);

    const nameMap = new Map<string, string>();
    if (message.guild) {
      const userIds = [...new Set(recentMessages.map((m) => m.userId))];
      await Promise.all(
        userIds.map(async (id) => {
          try {
            const member = await message.guild!.members.fetch(id);
            nameMap.set(id, member.displayName);
          } catch {
            nameMap.set(id, id);
          }
        }),
      );
    }

    const repliedId = message.reference?.messageId ?? null;
    const ch = message.channel;
    const threadId =
      "threadId" in ch ? String(ch.threadId ?? "") || null : null;

    const context = buildOpinionContext(recentMessages, repliedId, threadId);

    const question =
      message.content.replace(/<@!?\d+>/g, "").trim() || "你怎麼看？";

    const impersonation = await resolveImpersonation(message, nameMap);

    const authorName =
      message.member?.displayName ?? message.author.username ?? message.author.id;

    const ref = await maybeReference(question, authorName);
    if (ref) {
      const text = ref.source
        ? `${ref.reply}\n— ${ref.source}`
        : ref.reply;
      await replyWithGif(message, text, ref.gifUrl);
      return;
    }

    const result = await chatReply(
      context.messages,
      question,
      nameMap,
      impersonation,
    );

    await sendChatReplies(message, context.messages, result.replies);
  } catch (error) {
    console.error("[MENTION] Error handling mention:", error);
    await message.reply("❌ 處理你的訊息時發生錯誤，請稍後再試。");
  }
}

async function resolveImpersonation(
  message: Message,
  nameMap: Map<string, string>,
): Promise<{ name: string; profile?: NonNullable<Awaited<ReturnType<typeof getProfile>>>["profile"] } | null> {
  const clientUser = message.client.user;
  const authorId = message.author.id;

  const mentioned = [
    ...(message.mentions.members?.values() ?? []),
  ].find((m) => m.id !== clientUser?.id && m.id !== authorId);

  let targetId: string | null = null;
  let targetName: string | null = null;

  if (mentioned) {
    targetId = mentioned.id;
    targetName = mentioned.displayName;
  } else {
    const questionNorm = message.content
      .replace(/<@!?\d+>/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    for (const [id, name] of nameMap.entries()) {
      if (id === clientUser?.id || id === authorId) continue;
      const norm = (name ?? "").replace(/\s+/g, "").toLowerCase();
      if (norm.length >= 2 && questionNorm.includes(norm)) {
        // 僅在語意上是「某人會怎麼說」時才視為模仿對象，避免誤判為一般提及
        if (/(會說|會怎麼|怎麼說|如果是.*的話|會說.*吧|可是說|應該說)/.test(
          message.content,
        )) {
          targetId = id;
          targetName = name;
          break;
        }
      }
    }
  }

  if (!targetId || !targetName) return null;

  // 偵測到模仿對象即使沒有畫像也回傳，讓模型告知可先用 /analyze 建立
  const cached = message.guild ? await getProfile(targetId, message.guild.id) : undefined;
  return cached ? { name: targetName, profile: cached.profile } : { name: targetName };
}

async function isReplyToBot(message: Message): Promise<boolean> {
  const refId = message.reference?.messageId;
  if (!refId) return false;
  const clientUser = message.client.user;
  if (!clientUser) return false;
  try {
    const ref = await getMessageById(refId);
    return ref?.userId === clientUser.id;
  } catch {
    return false;
  }
}

const EXPLICIT_SEARCH_RE =
  /(你)?(找|查|搜|google|search|lookup|查詢|搜尋|找一下|查一下|搜一下)((一下)|(看看))?/i;

function isExplicitSearch(text: string): boolean {
  return EXPLICIT_SEARCH_RE.test(text);
}

async function maybeReference(
  question: string,
  authorName: string,
): Promise<{ reply: string; source: string; gifUrl?: string } | null> {
  const text = question.trim();
  if (!text) return null;
  if (text.startsWith("/")) return null;
  if (/\w+:\/\/|https?:\/\//i.test(text)) return null;

  const explicit = isExplicitSearch(text);
  const explicitGif = isExplicitGifRequest(text);

  // 明確要圖 → 直接丟 GIF，不走文字參考
  if (explicitGif && config.gif.enabled) {
    const q = cleanGifQuery(text);
    if (q) {
      const keyword = (await gifKeyword(q)) || q;
      const urls = await searchGif(keyword);
      if (urls.length > 0) {
        return { reply: "", source: "", gifUrl: urls[0] };
      }
    }
  }

  // 只有短句或明確要求搜尋才做網路查證
  if (!explicit && (text.length < 2 || text.length > 80)) return null;

  try {
    const query = explicit
      ? text.replace(EXPLICIT_SEARCH_RE, " ").replace(/\s+/g, " ").trim() || text
      : text;

    const docs = await searchWithContent(query, 3);
    if (docs.length === 0) return null;

    const result = await referenceReply(text, authorName, docs);
    if (!result.shouldReply || !result.reply.trim()) return null;

    let gifUrl: string | undefined;
    if (
      config.gif.enabled &&
      isValidGifKeyword(result.gifQuery) &&
      Math.random() < config.gif.probability
    ) {
      const urls = await searchGif(result.gifQuery);
      if (urls.length > 0) gifUrl = urls[0];
    }

    return { reply: result.reply, source: result.source, gifUrl };
  } catch (error) {
    console.error("[REF] Error during reference lookup:", error);
    return null;
  }
}

async function replyWithGif(message: Message, text: string, gifUrl?: string) {
  if (gifUrl) {
    await message.reply({
      content: text,
      embeds: [{ image: { url: gifUrl } }],
    });
  } else {
    await message.reply(text);
  }
}

async function sendChatReplies(
  message: Message,
  contextMessages: { id: string }[],
  replies: Array<{ content: string; messageIndex: number | null }>,
) {
  for (const reply of replies) {
    const targetId =
      reply.messageIndex != null &&
      reply.messageIndex >= 0 &&
      reply.messageIndex < contextMessages.length
        ? contextMessages[reply.messageIndex]?.id
        : undefined;

    if (targetId && targetId !== message.id) {
      await (message.channel as TextChannel).send({
        content: reply.content,
        reply: { messageReference: targetId },
      });
    } else {
      await message.reply(reply.content);
    }
  }
}