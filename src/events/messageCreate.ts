import { Events } from "discord.js";
import type { Message, TextChannel } from "discord.js";
import { storeMessage, getRecentMessages } from "../services/message-store.js";
import { upsertUser } from "../services/user-store.js";
import { getProfile } from "../services/profile-store.js";
import { buildOpinionContext } from "../services/context-builder.js";
import { chatReply } from "../llm/chat.js";

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message: Message) {
    if (message.author.bot) return;
    if (!message.guild) return;

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
    if (!message.mentions.has(clientUser)) return;

    await handleMention(message);
  },
};

async function handleMention(message: Message) {
  try {
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