import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/interfaces.js";
import { getMessagesByUser } from "../services/message-store.js";
import { generateProfile } from "../llm/profile.js";
import { saveProfile } from "../services/profile-store.js";
import { buildProfileEmbed } from "../utils/format.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("analyze")
    .setDescription("分析某位成員的說話風格，建立個人畫像")
    .addUserOption((option) =>
      option.setName("user").setDescription("要分析的成員").setRequired(true),
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "❌ 此指令只能在伺服器中使用。", flags: 64 });
      return;
    }

    const target = interaction.options.getUser("user", true);
    await interaction.deferReply();

    const messages = await getMessagesByUser(target.id, guild.id, 300);

    const valid = messages.filter((m) => m.content.trim().length > 0);
    if (valid.length < 10) {
      await interaction.editReply(
        `⚠️ <@${target.id}> 目前只有 ${valid.length} 則可分析的訊息，至少需要 10 則。請先執行 \`/backfill-all\` 匯入更多歷史訊息。`,
      );
      return;
    }

    const profile = await generateProfile(messages);

    const displayName =
      guild.members.cache.get(target.id)?.displayName ??
      target.username ??
      target.id;
    await saveProfile(target.id, guild.id, profile, valid.length);

    const embed = buildProfileEmbed(displayName, profile, valid.length);
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
