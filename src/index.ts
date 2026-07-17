import { client } from "./client.js";
import { loadCommands } from "./handlers/commands.js";
import { loadEvents } from "./handlers/events.js";
import { join } from "node:path";
import { config } from "./config.js";

process.on("unhandledRejection", (err) => {
  console.error("[BOT] Unhandled rejection:", err);
});

const rootDir = join(import.meta.dirname, "..");
const isProd = import.meta.dirname.endsWith("dist");
const srcDir = isProd ? "dist" : "src";

client.commands = await loadCommands(join(rootDir, srcDir, "commands"));
await loadEvents(join(rootDir, srcDir, "events"), client);

console.log("[BOT] Logging in...");
await client.login(config.discord.token);
