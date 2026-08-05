import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/interfaces.js";
import { parseDuration, parseOptionalDate } from "../utils/time.js";
import { createJob, getRunningJob } from "../services/job-store.js";
import { runBackfill } from "../services/backfill.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("backfill-all")
    .setDescription("匯入整個伺服器所有頻道（含 thread）的歷史訊息")
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("時間範圍，如 3d、7d、14d、30d（省略 = 全部歷史）")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription("基準日期，如 2024-01-15（預設為現在）")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("抓取模式：auto（預設）、incremental（只抓新增）、full（強制重掃）")
        .setRequired(false)
        .addChoices(
          { name: "auto（預設，有水標則增量）", value: "auto" },
          { name: "incremental（只抓新增）", value: "incremental" },
          { name: "full（強制完整重掃）", value: "full" },
        ),
    ),

  async execute(interaction) {
    const durationStr = interaction.options.getString("duration");
    const dateStr = interaction.options.getString("date");
    const mode = (interaction.options.getString("mode") ?? "auto") as
      | "auto"
      | "full"
      | "incremental";

    let startMs = 0;
    let endMs = Date.now();

    if (durationStr) {
      const duration = parseDuration(durationStr);
      if (!duration) {
        await interaction.reply({
          content: "❌ 無效的時間格式。請使用如 `3d`、`7d`、`14d` 的格式。",
          flags: 64,
        });
        return;
      }
      const baseDate = parseOptionalDate(dateStr) ?? new Date();
      const isNegative = durationStr.trim().startsWith("-");
      if (isNegative) {
        startMs = baseDate.getTime() - duration.ms;
        endMs = baseDate.getTime();
      } else if (dateStr) {
        startMs = baseDate.getTime();
        endMs = baseDate.getTime() + duration.ms;
      } else {
        startMs = baseDate.getTime() - duration.ms;
        endMs = baseDate.getTime();
      }
    } else if (dateStr) {
      const base = parseOptionalDate(dateStr);
      if (!base) {
        await interaction.reply({ content: "❌ 無效的日期格式。", flags: 64 });
        return;
      }
      startMs = 0;
      endMs = base.getTime();
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "❌ 此指令只能在伺服器中使用。",
        flags: 64,
      });
      return;
    }

    const running = await getRunningJob(guild.id);
    if (running) {
      await interaction.reply({
        content: "⚠️ 已有抓取任務正在進行中，請先用 `/backfill-status` 查詢進度。",
        flags: 64,
      });
      return;
    }

    const job = await createJob(guild.id);

    const rangeLabel = durationStr
      ? `過去 ${parseDuration(durationStr)!.label}`
      : "全部歷史";

    await interaction.reply(
      `⏳ 已開始${rangeLabel}的伺服器訊息抓取（模式: ${mode}），請用 \`/backfill-status\` 查詢進度。`,
    );

    void runBackfill(guild, job.id, { startMs, endMs, mode }).catch((error) => {
      console.error("[BACKFILL-ALL] unhandled error:", error);
    });
  },
};

export default command;
