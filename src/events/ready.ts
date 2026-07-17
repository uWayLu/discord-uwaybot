import { Events } from "discord.js";
import type { Client } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client<true>) {
    console.log(`[BOT] Ready! Logged in as ${client.user.tag}`);
    console.log(`[BOT] Serving ${client.guilds.cache.size} guild(s)`);
  },
};
