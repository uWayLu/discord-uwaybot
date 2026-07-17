import { Events } from "discord.js";
import type { Message, TextChannel } from "discord.js";
import { storeMessage, getRecentMessages } from "../services/message-store.js";
import { buildOpinionContext } from "../services/context-builder.js";
import { getOpinion } from "../llm/opinion.js";
import { buildOpinionEmbed } from "../utils/format.js";

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

    const recentMessages = await getRecentMessages(message.channelId, 50);

    const repliedId = message.reference?.messageId ?? null;
    const ch = message.channel;
    const threadId =
      "threadId" in ch ? String(ch.threadId ?? "") || null : null;

    const context = buildOpinionContext(recentMessages, repliedId, threadId);

    const question =
      message.content.replace(/<@!?\d+>/g, "").trim() || "你怎麼看？";

    const result = await getOpinion(context.messages, question);

    const embed = buildOpinionEmbed(
      result.opinion,
      result.references,
      result.confidence,
    );

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("[MENTION] Error handling mention:", error);
    await message.reply("❌ 處理你的問題時發生錯誤，請稍後再試。");
  }
}
