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
    .setDescription(opinion || "抱歉，我無法產生回應。")
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
  totalMentions: number = results.length,
  searchSummary: string = "",
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

  embed.addFields({
    name: "📊 統計",
    value: `共提及 **${totalMentions}** 次`,
  });

  if (searchSummary) {
    embed.addFields({
      name: "📝 摘要",
      value: searchSummary,
    });
  }

  for (let i = 0; i < Math.min(results.length, 5); i++) {
    const r = results[i]!;
    const parts: string[] = [`💬 ${r.summary}`];
    if (r.original) {
      const orig = r.original.length > 150 ? r.original.slice(0, 150) + "..." : r.original;
      parts.push(`> ${orig}`);
    }
    if (r.userId) parts.push(`👤 <@${r.userId}>`);
    if (r.timestamp) parts.push(`🕐 ${r.timestamp}`);

    embed.addFields({
      name: `📌 ${i + 1}.`,
      value: parts.join("\n"),
    });
  }

  if (results.length > 5) {
    embed.setFooter({ text: `共 ${results.length} 個結果，顯示前 5 個` });
  }

  return embed;
}

export function buildProfileEmbed(
  displayName: string,
  profile: {
    tone: string;
    style_features: string[];
    catchphrases: string[];
    particles: string[];
    emoji_habits: string;
    topics: string[];
    reply_length: string;
    punctuation: string;
    typical_style_sample: string;
  },
  sampleCount: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🧬 ${displayName} 的說話風格畫像`)
    .setDescription(`分析自 **${sampleCount}** 則訊息`)
    .setColor(0x9b59b6)
    .setTimestamp();

  embed.addFields(
    { name: "🎭 語氣", value: profile.tone || "—" },
    { name: "✍️ 用字習慣", value: profile.style_features.join("、") || "—" },
    {
      name: "💬 口頭禪",
      value: profile.catchphrases.map((c) => `「${c}」`).join(" ") || "—",
    },
    { name: "🔊 常用語助詞", value: profile.particles.join(" ") || "—" },
    { name: "😀 表情習慣", value: profile.emoji_habits || "—" },
    { name: "📚 話題偏好", value: profile.topics.map((t) => `• ${t}`).join("\n") || "—" },
    { name: "📏 回覆長度", value: profile.reply_length || "—" },
    { name: "📐 標點習慣", value: profile.punctuation || "—" },
  );

  if (profile.typical_style_sample) {
    embed.addFields({
      name: "🎤 風格範例",
      value: `> ${profile.typical_style_sample}`,
    });
  }

  return embed;
}

export function buildSimulateEmbed(
  targetName: string,
  predictedReply: string,
  confidence: number,
  styleFeatures: string[],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🤖 預測回覆 · 非本人發言`)
    .setDescription(
      `這是 UwayBot 依 **${targetName}** 的說話風格所做的「預測」，並非本人實際發言。\n\n> ${predictedReply}`,
    )
    .setColor(0x5865f2)
    .setFooter({ text: `信心度: ${Math.round(confidence * 100)}%` })
    .setTimestamp();

  if (styleFeatures.length > 0) {
    embed.addFields({
      name: "🎯 模仿依據",
      value: styleFeatures.map((f) => `• ${f}`).join("\n"),
    });
  }

  return embed;
}
