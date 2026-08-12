import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/interfaces.js";
import {
  getRecentMessages,
  getMessagesInTimeRange,
  getMessagesByUser,
} from "../services/message-store.js";
import { getProfile } from "../services/profile-store.js";
import { retrieveExamples } from "../services/retrieval.js";
import { predictReply, predictOpinion } from "../llm/simulate.js";
import { buildSimulateEmbed, buildSimulateOpinionEmbed } from "../utils/format.js";
import { parseDuration } from "../utils/time.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("replyas")
    .setDescription("以某位成員的風格預測他會怎麼回應（AI 模仿，非本人）")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("要模仿其風格的成員（需先 /analyze 建立畫像）")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("next: 預測他下一句（預設）；opinion: 模擬他對特定問題的看法")
        .addChoices(
          { name: "預測下一句", value: "next" },
          { name: "模擬看法", value: "opinion" },
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("opinion 模式專用：要問他的問題")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("參考對話的時間範圍，如 1h、1d（預設取最近 50 則）")
        .setRequired(false),
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "❌ 此指令只能在伺服器中使用。", flags: 64 });
      return;
    }

    const target = interaction.options.getUser("user", true);
    const mode = interaction.options.getString("mode") ?? "next";
    const question = interaction.options.getString("question");
    const durationStr = interaction.options.getString("duration");

    if (mode === "opinion" && !question) {
      await interaction.reply({
        content: "❌ opinion 模式需要提供 question 參數。",
        flags: 64,
      });
      return;
    }

    await interaction.deferReply();

    const cached = await getProfile(target.id, guild.id);
    if (!cached) {
      await interaction.editReply(
        `⚠️ <@${target.id}> 還沒有說話風格畫像。請先執行 \`/analyze user:@${target.username}\` 建立畫像，再執行本指令。`,
      );
      return;
    }

    let context;
    if (durationStr) {
      const duration = parseDuration(durationStr);
      if (!duration) {
        await interaction.editReply(
          "❌ 無效的時間格式。請使用如 `30m`、`1h`、`1d`。",
        );
        return;
      }
      const startMs = Date.now() - duration.ms;
      context = await getMessagesInTimeRange(interaction.channelId, startMs, Date.now());
    } else {
      context = await getRecentMessages(interaction.channelId, 50);
    }

    const contextMessages = context.filter(
      (m) => m.content.trim().length > 0 && m.userId !== target.id,
    );

    if (contextMessages.length === 0) {
      await interaction.editReply(
        "⚠️ 目前頻道沒有足夠的對話上下文可供預測。請在有對話的頻道使用，或改用 `/backfill-all` 匯入歷史訊息。",
      );
      return;
    }

    const userMessages = await getMessagesByUser(target.id, guild.id, 500);
    const examples = retrieveExamples(userMessages, contextMessages, 10);

    const displayName =
      guild.members.cache.get(target.id)?.displayName ?? target.username ?? target.id;

    if (mode === "opinion") {
      const result = await predictOpinion(
        cached.profile,
        question!,
        contextMessages.slice(-40),
        examples,
      );
      if (!result.predicted_reply) {
        await interaction.editReply("⚠️ 無法產生模擬，請稍後再試。");
        return;
      }
      const embed = buildSimulateOpinionEmbed(
        displayName,
        result.predicted_reply,
        result.confidence,
        result.matched_style_features,
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const result = await predictReply(
      cached.profile,
      contextMessages.slice(-40),
      examples,
    );

    if (!result.predicted_reply) {
      await interaction.editReply("⚠️ 無法產生預測，請稍後再試。");
      return;
    }

    const embed = buildSimulateEmbed(
      displayName,
      result.predicted_reply,
      result.confidence,
      result.matched_style_features,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;