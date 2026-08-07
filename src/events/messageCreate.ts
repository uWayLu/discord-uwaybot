import { Events, EmbedBuilder } from "discord.js";
import type { Message, TextChannel } from "discord.js";
import {
  storeMessage,
  getRecentMessages,
  getMessagesByUser,
} from "../services/message-store.js";
import { upsertUser } from "../services/user-store.js";
import { getProfile } from "../services/profile-store.js";
import { retrieveExamples } from "../services/retrieval.js";
import { buildOpinionContext } from "../services/context-builder.js";
import { getOpinion } from "../llm/opinion.js";
import { predictOpinion } from "../llm/simulate.js";
import {
  buildOpinionEmbed,
  buildSimulateOpinionEmbed,
} from "../utils/format.js";
import { extractUrls, fetchUrl } from "../utils/web.js";

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message: Message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const ch = message.channel;
    const threadId =
      "threadId" in ch ? String(ch.threadId ?? "") || null : null;

    await storeMessage({
      id: message.id,
      guildId: message.guild.id,
      channelId: message.channelId,
      threadId,
      userId: message.author.id,
      content: message.content,
      createdAt: message.createdTimestamp,
      replyTo: message.reference?.messageId ?? null,
      hasEmbed: message.embeds.length > 0,
    });

    const displayName =
      message.member?.displayName ?? message.author.username ?? message.author.id;
    await upsertUser({
      id: message.author.id,
      guildId: message.guild.id,
      displayName,
    });

    const clientUser = message.client.user;
    if (!message.mentions.has(clientUser)) return;

    await handleMention(message);
  },
};

async function handleMention(message: Message) {
  try {
    if ("sendTyping" in message.channel) {
      await (message.channel as TextChannel).sendTyping().catch(() => {});
    }

    const recentMessages = await getRecentMessages(message.channelId, 100);

    const nameMap = new Map<string, string>();
    if (message.guild) {
      const userIds = [...new Set(recentMessages.map((m) => m.userId))];
      await Promise.all(
        userIds.map(async (id) => {
          try {
            const member = await message.guild!.members.fetch(id);
            nameMap.set(id, member.displayName);
          } catch {
            nameMap.set(id, id);
          }
        }),
      );
    }

    const repliedId = message.reference?.messageId ?? null;
    const ch = message.channel;
    const threadId =
      "threadId" in ch ? String(ch.threadId ?? "") || null : null;

    const context = buildOpinionContext(recentMessages, repliedId, threadId);

    const question =
      message.content.replace(/<@!?\d+>/g, "").trim() || "你怎麼看？";

    const candidates = resolveSimulateCandidates(message, nameMap);
    if (candidates.length > 0) {
      const simulated = await simulateCandidates(
        message,
        candidates,
        context.messages,
        question,
        nameMap,
      );
      if (simulated.embeds.length > 0) {
        await message.reply({ embeds: simulated.embeds });
        return;
      }
      if (simulated.missingProfiles.length > 0) {
        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🤖 我沒法模擬沒畫像的成員")
              .setDescription(
                `${simulated.missingProfiles
                  .map((id) => `<@${id}>`)
                  .join(" ")} 還沒有風格畫像，無法以他的口吻回答。請先用 \`/analyze user:@名字\` 建立畫像，或改成 @我 讓我直接給看法。`,
              )
              .setColor(0xed4245)
              .setTimestamp(),
          ],
        });
        return;
      }
    }

    const urls = extractUrls(question);
    let webContent = "";
    if (urls.length > 0) {
      const fetches = await Promise.all(urls.slice(0, 3).map(fetchUrl));
      webContent = fetches
        .map((f, i) => {
          if (f.error) return `[${urls[i]}] 錯誤: ${f.error}`;
          return `[${f.title || urls[i]}]\n${f.content}`;
        })
        .join("\n\n---\n\n");
    }

    const result = await getOpinion(context.messages, question, webContent, nameMap);

    const embed = buildOpinionEmbed(
      result.opinion,
      result.references,
      result.confidence,
    );

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("[MENTION] Error handling mention:", error);
    await message.reply("❌ 處理你的問題時發生錯誤，請稍後再試。");
  }
}

function resolveSimulateCandidates(
  message: Message,
  nameMap: Map<string, string>,
): string[] {
  const clientUser = message.client.user;
  const authorId = message.author.id;

  const mentioned = [
    ...(message.mentions.members?.values() ?? []),
  ].filter((m) => m.id !== clientUser?.id && m.id !== authorId);
  if (mentioned.length > 0) {
    return mentioned.map((m) => m.id);
  }

  const questionNorm = message.content
    .replace(/<@!?\d+>/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

  const hits: string[] = [];
  for (const id of nameMap.keys()) {
    if (id === clientUser?.id || id === authorId) continue;
    const name = (nameMap.get(id) ?? "").replace(/\s+/g, "").toLowerCase();
    if (name.length >= 2 && questionNorm.includes(name)) {
      hits.push(id);
    }
  }
  return hits;
}

async function simulateCandidates(
  message: Message,
  candidateIds: string[],
  contextMessages: ReturnType<typeof buildOpinionContext>["messages"],
  question: string,
  nameMap: Map<string, string>,
): Promise<{ embeds: EmbedBuilder[]; missingProfiles: string[] }> {
  const embeds: EmbedBuilder[] = [];
  const missingProfiles: string[] = [];

  for (const id of candidateIds.slice(0, 3)) {
    const cached = await getProfile(id, message.guild!.id);
    if (!cached) {
      missingProfiles.push(id);
      continue;
    }

    try {
      const userMessages = await getMessagesByUser(id, message.guild!.id, 500);
      const simContext = contextMessages
        .filter((m) => m.userId !== id && m.content.trim().length > 0)
        .slice(-40);
      const examples = retrieveExamples(userMessages, simContext, 10);
      const result = await predictOpinion(
        cached.profile,
        question,
        simContext,
        examples,
        nameMap,
      );

      const displayName =
        nameMap.get(id) ??
        (await message.guild!.members.fetch(id).then(
          (m) => m.displayName,
          () => id,
        ));

      embeds.push(
        buildSimulateOpinionEmbed(
          displayName,
          result.predicted_reply,
          result.confidence,
          result.matched_style_features,
        ),
      );
    } catch (error) {
      console.error("[MENTION] Error simulating member:", id, error);
      missingProfiles.push(id);
    }
  }

  return { embeds, missingProfiles };
}
