import { client } from "./client.js";
import { loadCommands } from "./handlers/commands.js";
import { loadEvents } from "./handlers/events.js";
import { join } from "node:path";
import { config } from "./config.js";

const rootDir = join(import.meta.dirname, "..");

client.commands = await loadCommands(join(rootDir, "src", "commands"));
await loadEvents(join(rootDir, "src", "events"), client);

console.log("[BOT] Logging in...");
await client.login(config.discord.token);
