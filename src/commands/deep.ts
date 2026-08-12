import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/interfaces.js";
import { getRecentMessages } from "../services/message-store.js";
import { buildOpinionContext } from "../services/context-builder.js";
import { getOpinion } from "../llm/opinion.js";
import { buildOpinionEmbed } from "../utils/format.js";
import { extractUrls, fetchUrl } from "../utils/web.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("deep")
    .setDescription("對當前對話或你貼的網址做深入分析，給出有依據的觀點")
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("想要深入探討的問題或主題（可直接包含網址）")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("context")
        .setDescription("參考的最近訊息數（預設 100）")
        .setRequired(false),
    ),

  async execute(interaction) {
    const question = interaction.options.getString("question", true);
    const contextLimit =
      Math.min(Math.max(interaction.options.getInteger("context") ?? 100, 10), 200) ?? 100;

    await interaction.deferReply();

    const recentMessages = await getRecentMessages(
      interaction.channelId,
      contextLimit,
    );

    const nameMap = new Map<string, string>();
    if (interaction.guild) {
      const userIds = [...new Set(recentMessages.map((m) => m.userId))];
      await Promise.all(
        userIds.map(async (id) => {
          try {
            const member = await interaction.guild!.members.fetch(id);
            nameMap.set(id, member.displayName);
          } catch {
            nameMap.set(id, id);
          }
        }),
      );
    }

    const context = buildOpinionContext(
      recentMessages,
      undefined,
      undefined,
      contextLimit,
    );

    const contextMessages = context.messages.filter(
      (m) => m.content.trim().length > 0,
    );

    if (contextMessages.length === 0) {
      await interaction.editReply(
        "⚠️ 目前頻道沒有足夠的對話上下文可供分析。",
      );
      return;
    }

    const urls = extractUrls(question);
    let webContent = "";
    if (urls.length > 0) {
      await interaction.editReply("🌐 正在擷取網址內容與分析上下文…");
      const fetches = await Promise.all(urls.slice(0, 3).map(fetchUrl));
      webContent = fetches
        .map((f, i) => {
          if (f.error) return `[${urls[i]}] 錯誤: ${f.error}`;
          return `[${f.title || urls[i]}]\n${f.content}`;
        })
        .join("\n\n---\n\n");
    }

    const result = await getOpinion(contextMessages, question, webContent, nameMap);

    const embed = buildOpinionEmbed(
      result.opinion,
      result.references,
      result.confidence,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;