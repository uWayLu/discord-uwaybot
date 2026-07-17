import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/interfaces.js";
import { getMessagesInTimeRange } from "../services/message-store.js";
import { detectTopics } from "../services/topic-detector.js";
import { summarizeTopics } from "../llm/summary.js";
import { buildSummaryEmbed } from "../utils/format.js";
import { parseDuration } from "../utils/time.js";
import { config } from "../config.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("summary")
    .setDescription("摘要目前頻道的訊息")
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("時間範圍，如 30m、6h、1d")
        .setRequired(true),
    ),

  async execute(interaction) {
    const durationStr = interaction.options.getString("duration", true);
    const duration = parseDuration(durationStr);

    if (!duration) {
      await interaction.reply({
        content: "❌ 無效的時間格式。請使用如 `30m`、`6h`、`1d` 的格式。",
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

    await interaction.deferReply();

    const now = Date.now();
    const start = now - duration.ms;

    const channel = interaction.channel;
    if (!channel || !("isTextBased" in channel) || !channel.isTextBased()) {
      await interaction.editReply("❌ 此指令只能在文字頻道中使用。");
      return;
    }

    const messages = await getMessagesInTimeRange(
      interaction.channelId,
      start,
      now,
    );

    const filtered = messages.filter(
      (m) =>
        !m.content.startsWith("/") &&
        m.content.trim().length > 0 &&
        !m.hasEmbed,
    );

    if (filtered.length < 5) {
      await interaction.editReply(
        `⚠️ 該時間範圍內只有 ${filtered.length} 則訊息，不足以產生有意義的摘要。至少需要 5 則。`,
      );
      return;
    }

    const topics = detectTopics(filtered, config.summary.topicGapMinutes);

    const result = await summarizeTopics(topics);

    const channelName =
      "name" in channel && typeof channel.name === "string"
        ? channel.name
        : "unknown";

    const embed = buildSummaryEmbed(
      result,
      {
        start,
        end: now,
        label: duration.label,
      },
      channelName,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
