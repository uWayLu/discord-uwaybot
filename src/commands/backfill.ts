import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/interfaces.js";
import { backfillMessages } from "../services/message-store.js";
import { parseDuration } from "../utils/time.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("backfill")
    .setDescription("匯入此頻道的歷史訊息")
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("匯入多久前的訊息，如 6h、1d、7d")
        .setRequired(true),
    ),

  async execute(interaction) {
    const durationStr = interaction.options.getString("duration", true);
    const duration = parseDuration(durationStr);

    if (!duration) {
      await interaction.reply({
        content: "❌ 無效的時間格式。請使用如 `6h`、`1d`、`7d` 的格式。",
        flags: 64,
      });
      return;
    }

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

    const cutoff = Date.now() - duration.ms;
    let allFetched: Array<{ id: string; content: string; createdTimestamp: number; author: { id: string }; reference: { messageId: string } | null; embeds: unknown[] }> = [];
    let lastId: string | undefined;
    let done = false;

    await interaction.editReply(`⏳ 正在匯入過去 ${duration.label} 的訊息...`);

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
