import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { CommandInteraction } from "discord.js";
import type { Command } from "../types/interfaces.js";
import { getMessagesInTimeRange } from "../services/message-store.js";
import { searchMessages } from "../llm/search.js";
import { buildSearchEmbed } from "../utils/format.js";
import { countMentions } from "../services/fts-count.js";
import { ftsIndexReady } from "../db/fts.js";
import { getDisplayName } from "../services/user-store.js";
import { parseDuration, parseOptionalDate } from "../utils/time.js";
import { config } from "../config.js";

const TOP_COUNT_DISPLAY = 10;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("搜尋頻道中的相關訊息，或統計一段時間內某關鍵字被提到的次數")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("搜尋關鍵字或問題")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("時間範圍，如 7d、14d、-3d 2024-01-15；計數模式可用 all（省略=30 天）")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription("基準日期，如 2024-01-15（預設為現在）")
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("count")
        .setDescription("計數模式：統計關鍵字被提到的次數（預設 30 天，全伺服器）")
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("僅統計指定頻道（預設全伺服器）")
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("僅統計指定使用者（預設所有人）")
        .setRequired(false),
    ),

  async execute(interaction) {
    const durationStr = interaction.options.getString("duration");
    const query = interaction.options.getString("query", true);
    const dateStr = interaction.options.getString("date");
    const countMode = interaction.options.getBoolean("count") ?? false;

    const isAll = durationStr?.trim().toLowerCase() === "all";
    const duration = isAll ? null : durationStr ? parseDuration(durationStr) : null;

    if (!countMode && (isAll || !duration)) {
      await interaction.reply({
        content: "❌ 搜尋模式需指定時間範圍，請使用如 `7d`、`14d`、`-3d`。",
        flags: 64,
      });
      return;
    }

    if (!countMode && duration && duration.ms > config.summary.maxHours * 60 * 60 * 1000) {
      await interaction.reply({
        content: `❌ 搜尋時間範圍不能超過 ${config.summary.maxHours} 小時；若要做長時間統計請改用計數模式（\`count:True\`）。`,
        flags: 64,
      });
      return;
    }

    const baseDate = parseOptionalDate(dateStr) ?? new Date();
    let startMs: number;
    let endMs: number;
    let label: string;
    if (isAll) {
      startMs = 0;
      endMs = Date.now();
      label = "全部時間";
    } else if (duration) {
      const isNegative = durationStr!.trim().startsWith("-");
      endMs = isNegative ? baseDate.getTime() : dateStr ? baseDate.getTime() + duration.ms : Date.now();
      startMs = isNegative ? baseDate.getTime() - duration.ms : dateStr ? baseDate.getTime() : Date.now() - duration.ms;
      label = duration.label;
    } else {
      // 計數模式省略 duration → 預設 N 天
      const days = config.searchCount.defaultDays;
      startMs = Date.now() - days * 24 * 60 * 60 * 1000;
      endMs = Date.now();
      label = `${days} 天`;
    }

    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply("❌ 此指令只能在伺服器中執行。");
      return;
    }

    if (countMode) {
      await runCount(interaction, query, { startMs, endMs, label, channelId: interaction.options.getChannel("channel")?.id, userId: interaction.options.getUser("user")?.id });
      return;
    }

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
      { label },
      channelName,
      result.total_mentions,
      result.summary,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

async function runCount(
  interaction: CommandInteraction,
  keyword: string,
  opts: { startMs: number; endMs: number; label: string; channelId?: string; userId?: string },
) {
  const guild = interaction.guild!;

  if (!ftsIndexReady()) {
    await interaction.editReply("⚠️ 全文索引仍在建立中，請稍後再試（首次約需數分鐘）。");
    return;
  }

  const result = countMentions({
    keyword,
    guildId: guild.id,
    channelId: opts.channelId,
    userId: opts.userId,
    startMs: opts.startMs,
    endMs: opts.endMs,
  });

  const channelName = opts.channelId
    ? (guild.channels.cache.get(opts.channelId)?.name ?? opts.channelId)
    : "全伺服器";
  const userName = opts.userId
    ? (guild.members.cache.get(opts.userId)?.displayName ?? (await getDisplayName(opts.userId, guild.id)) ?? `<@${opts.userId}>`)
    : "所有人";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`「${keyword}」被提到的次數`)
    .setDescription(
      `**時間：**${opts.label}\n**範圍：**${channelName}｜${userName}\n**方式：**${result.usedFts ? "全文索引（FTS）" : "字面比對（LIKE）"}`,
    )
    .addFields({ name: "🔢 總次數", value: `**${result.total}**`, inline: true });

  if (result.byChannel.length > 0) {
    const lines = result.byChannel
      .slice(0, TOP_COUNT_DISPLAY)
      .map((r) => `${guild.channels.cache.get(r.key)?.name ?? r.key}：${r.count} 次`)
      .join("\n");
    embed.addFields({ name: "📁 各頻道", value: lines || "—" });
  }

  if (result.byUser.length > 0) {
    const lines = result.byUser
      .map((r) => `${guild.members.cache.get(r.key)?.displayName ?? `<@${r.key}>`}：${r.count} 次`)
      .join("\n");
    embed.addFields({ name: "🙋 最多人（Top 10）", value: lines || "—" });
  }

  await interaction.editReply({ embeds: [embed] });
}

export default command;