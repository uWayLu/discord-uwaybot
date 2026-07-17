import { Events } from "discord.js";
import type { BaseInteraction } from "discord.js";

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction: BaseInteraction) {
    console.log(`[EVT] Interaction received: type=${interaction.type}, isChatInput=${interaction.isChatInputCommand()}`);

    if (!interaction.isChatInputCommand()) return;

    console.log(`[CMD] /${interaction.commandName} by ${interaction.user.id} in ${interaction.channelId}`);

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`[BOT] No command matching ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
      console.log(`[CMD] /${interaction.commandName} completed`);
    } catch (error) {
      console.error(`[BOT] Error executing ${interaction.commandName}:`, error);
      try {
        const reply = {
          content: "❌ 執行指令時發生錯誤。",
          flags: 64 as const,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch (replyError) {
        console.error(`[BOT] Failed to send error reply:`, replyError);
      }
    }
  },
};
