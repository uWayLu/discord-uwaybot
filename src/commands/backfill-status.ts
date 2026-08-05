import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { Command } from "../types/interfaces.js";
import { getLatestJob } from "../services/job-store.js";
import { formatTimestamp } from "../utils/time.js";

const STATUS_META: Record<string, { label: string; color: number }> = {
  running: { label: "🔄 進行中", color: 0xfee75c },
  done: { label: "✅ 已完成", color: 0x57f287 },
  failed: { label: "❌ 失敗", color: 0xed4245 },
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("backfill-status")
    .setDescription("查詢最近一次 /backfill-all 抓取任務的進度"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "❌ 此指令只能在伺服器中使用。", flags: 64 });
      return;
    }

    const job = await getLatestJob(guild.id);
    if (!job) {
      await interaction.reply({
        content: "📭 尚未執行過任何抓取任務。請先使用 `/backfill-all`。",
        flags: 64,
      });
      return;
    }

    const meta = STATUS_META[job.status] ?? STATUS_META.done!;

    const embed = new EmbedBuilder()
      .setTitle("📦 抓取任務狀態")
      .setDescription(`${meta.label}（任務 #${job.id}）`)
      .setColor(meta.color)
      .setTimestamp();

    embed.addFields(
      {
        name: "📅 開始時間",
        value: formatTimestamp(job.startedAt),
        inline: true,
      },
      {
        name: "🏁 結束時間",
        value: job.finishedAt ? formatTimestamp(job.finishedAt) : "—",
        inline: true,
      },
      {
        name: "📺 頻道進度",
        value: `${job.channelsDone} / ${job.channelsTotal}`,
        inline: true,
      },
      {
        name: "🧵 Thread 進度",
        value: `${job.threadsDone} / ${job.threadsTotal}`,
        inline: true,
      },
      {
        name: "📨 已抓取訊息",
        value: `${job.messagesFetched} 則`,
        inline: true,
      },
      {
        name: "➕ 新增訊息",
        value: `${job.messagesInserted} 則`,
        inline: true,
      },
    );

    if (job.error) {
      embed.addFields({ name: "⚠️ 錯誤", value: `\`${job.error.slice(0, 1000)}\`` });
    }

    if (job.status === "running") {
      embed.setFooter({ text: "任務進行中，可以再次執行本指令查看最新進度。" });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
