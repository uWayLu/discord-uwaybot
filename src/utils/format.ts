import { EmbedBuilder } from "discord.js";

interface TopicSummary {
  title: string;
  summary: string;
  participants: string[];
  decisions: string[];
  open_questions: string[];
}

interface SummaryResult {
  topics: TopicSummary[];
}

export function buildSummaryEmbed(
  result: SummaryResult,
  timeRange: { start: number; end: number; label: string },
  channelName: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📋 ${channelName} 訊息摘要`)
    .setDescription(`過去 **${timeRange.label}** 的討論重點`)
    .setColor(0x5865f2)
    .setTimestamp();

  if (result.topics.length === 0) {
    embed.addFields({ name: "沒有找到討論主題", value: "該時間範圍內無足夠訊息進行摘要。" });
    return embed;
  }

  for (const topic of result.topics) {
    const parts: string[] = [`💬 ${topic.summary}`];

    if (topic.participants.length > 0) {
      parts.push(`👥 參與者: ${topic.participants.map((id) => `<@${id}>`).join(", ")}`);
    }
    if (topic.decisions.length > 0) {
      parts.push(`✅ 決定:\n${topic.decisions.map((d) => `• ${d}`).join("\n")}`);
    }
    if (topic.open_questions.length > 0) {
      parts.push(`❓ 未解:\n${topic.open_questions.map((q) => `• ${q}`).join("\n")}`);
    }

    embed.addFields({
      name: `📌 ${topic.title}`,
      value: parts.join("\n"),
    });
  }

  return embed;
}

export function buildOpinionEmbed(
  opinion: string,
  references: string[],
  confidence: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("💭 我的看法")
    .setDescription(opinion)
    .setColor(0xfee75c)
    .setFooter({ text: `信心度: ${Math.round(confidence * 100)}%` })
    .setTimestamp();

  if (references.length > 0) {
    embed.addFields({
      name: "參考訊息",
      value: references.map((r) => `• ${r}`).join("\n"),
    });
  }

  return embed;
}

export function buildSearchEmbed(
  results: Array<{ summary: string; original: string; userId: string; timestamp: string }>,
  query: string,
  timeRange: { label: string },
  channelName: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🔍 ${channelName} 搜尋結果`)
    .setDescription(`查詢: **${query}**（${timeRange.label}）`)
    .setColor(0x57f287)
    .setTimestamp();

  if (results.length === 0) {
    embed.addFields({ name: "沒有找到相關內容", value: "該時間範圍內無與查詢相關的訊息。" });
    return embed;
  }

  for (const r of results.slice(0, 5)) {
    const parts: string[] = [`💬 ${r.summary}`];
    parts.push(`> ${r.original.slice(0, 100)}${r.original.length > 100 ? "..." : ""}`);
    if (r.userId) parts.push(`👤 <@${r.userId}>`);
    if (r.timestamp) parts.push(`🕐 ${r.timestamp}`);

    embed.addFields({
      name: `📌 結果`,
      value: parts.join("\n"),
    });
  }

  if (results.length > 5) {
    embed.setFooter({ text: `共 ${results.length} 個結果，顯示前 5 個` });
  }

  return embed;
}
