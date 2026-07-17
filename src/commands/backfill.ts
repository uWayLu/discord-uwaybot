import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/interfaces.js";
import { backfillMessages } from "../services/message-store.js";
import { parseDuration, parseOptionalDate } from "../utils/time.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("backfill")
    .setDescription("匯入此頻道的歷史訊息")
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("時間範圍，如 3d、+3d、-3d（預設從現在起）")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription("基準日期，如 2024-01-15、2024-01-15T10:00:00+08:00（預設為現在）")
        .setRequired(false),
    ),

  async execute(interaction) {
    const durationStr = interaction.options.getString("duration", true);
    const dateStr = interaction.options.getString("date");
    const duration = parseDuration(durationStr);

    if (!duration) {
      await interaction.reply({
        content: "❌ 無效的時間格式。請使用如 `3d`、`+3d`、`-3d`、`6h` 的格式。",
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

    if (!("messages" in channel)) {
      await interaction.editReply("❌ 此頻道不支援訊息歷史查詢。");
      return;
    }

    const cutoff = startMs;
    let allFetched: Array<{ id: string; content: string; createdTimestamp: number; author: { id: string }; reference: { messageId: string } | null; embeds: unknown[] }> = [];
    let lastId: string | undefined;
    let done = false;

    const dateLabel = dateStr ? ` ${dateStr} 起` : "";
    await interaction.editReply(`⏳ 正在匯入過去 ${duration.label} 的訊息...${dateLabel}`);

    while (!done) {
      const options: Record<string, unknown> = { limit: 100 };
      if (lastId) options.before = lastId;

      const fetched = await (channel as import("discord.js").TextChannel).messages.fetch(options as import("discord.js").FetchMessagesOptions);
      const arr = Array.from(fetched.values());

      if (arr.length === 0) break;

      for (const msg of arr) {
        if (msg.createdTimestamp < cutoff) {
          done = true;
          break;
        }
        allFetched.push(msg as unknown as typeof allFetched[0]);
        lastId = msg.id;
      }

      if (arr.length < 100) done = true;
    }

    if (allFetched.length === 0) {
      await interaction.editReply("⚠️ 該時間範圍內沒有找到訊息。");
      return;
    }

    const guildId = interaction.guildId ?? "";

    const stored = allFetched.map((m) => ({
      id: m.id,
      guildId,
      channelId: interaction.channelId,
      threadId: null as string | null,
      userId: m.author.id,
      content: m.content,
      createdAt: m.createdTimestamp,
      replyTo: m.reference?.messageId ?? null,
      hasEmbed: m.embeds.length > 0,
    }));

    const inserted = await backfillMessages(interaction.channelId, stored);

    await interaction.editReply(
      `✅ 找到 ${allFetched.length} 則訊息，新增 ${inserted} 則（已存在的略過）。`,
    );
  },
};

export default command;
