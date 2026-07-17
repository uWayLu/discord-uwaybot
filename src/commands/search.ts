import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/interfaces.js";
import { getMessagesInTimeRange } from "../services/message-store.js";
import { searchMessages } from "../llm/search.js";
import { buildSearchEmbed } from "../utils/format.js";
import { parseDuration, parseOptionalDate } from "../utils/time.js";
import { config } from "../config.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("搜尋頻道中的相關訊息")
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("時間範圍，如 7d、14d、-3d 2024-01-15")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("搜尋關鍵字或問題")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription("基準日期，如 2024-01-15（預設為現在）")
        .setRequired(false),
    ),

  async execute(interaction) {
    const durationStr = interaction.options.getString("duration", true);
    const query = interaction.options.getString("query", true);
    const dateStr = interaction.options.getString("date");
    const duration = parseDuration(durationStr);

    if (!duration) {
      await interaction.reply({
        content: "❌ 無效的時間格式。請使用如 `7d`、`14d`、`-3d` 的格式。",
        flags: 64,
      });
      return;
    }

    if (duration.ms > config.summary.maxHours * 60 * 60 * 1000) {
      await interaction.reply({
        content: `❌ 時間範圍不能超過 ${config.summary.maxHours} 小時。`,
        flags: 64,
      });
      return;
    }

    const baseDate = parseOptionalDate(dateStr) ?? new Date();
    const isNegative = durationStr.trim().startsWith("-");
    const endMs = isNegative ? baseDate.getTime() : (dateStr ? baseDate.getTime() + duration.ms : Date.now());
    const startMs = isNegative ? baseDate.getTime() - duration.ms : (dateStr ? baseDate.getTime() : Date.now() - duration.ms);

    await interaction.deferReply();

    const channel = interaction.channel;
    if (!channel || !("isTextBased" in channel) || !channel.isTextBased()) {
      await interaction.editReply("❌ 此指令只能在文字頻道中使用。");
      return;
    }

    const messages = await getMessagesInTimeRange(
      interaction.channelId,
      startMs,
      endMs,
    );

    const filtered = messages.filter(
      (m) =>
        !m.content.startsWith("/") &&
        m.content.trim().length > 0 &&
        !m.hasEmbed,
    );

    if (filtered.length === 0) {
      await interaction.editReply("⚠️ 該時間範圍內沒有找到訊息。");
      return;
    }

    const result = await searchMessages(filtered, query);

    const channelName =
      "name" in channel && typeof channel.name === "string"
        ? channel.name
        : "unknown";

    const embed = buildSearchEmbed(
      result.results,
      query,
      { label: duration.label },
      channelName,
      result.total_mentions,
      result.summary,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
