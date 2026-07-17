import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import type { Command } from "./types/interfaces.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection<string, Command>();

export { client };
