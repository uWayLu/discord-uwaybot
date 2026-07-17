import { REST, Routes } from "discord.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../src/config.js";

const commands: object[] = [];
const commandsDir = join(import.meta.dirname, "..", "src", "commands");

async function loadCommandData(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await loadCommandData(join(dir, entry.name));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
      const mod = await import(join(dir, entry.name));
      if (mod.default?.data) {
        commands.push(mod.default.data.toJSON());
      }
    }
  }
}

await loadCommandData(commandsDir);

const rest = new REST({ version: "10" }).setToken(config.discord.token);

if (config.discord.guildId) {
  console.log(`Registering ${commands.length} guild commands...`);
  await rest.put(
    Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
    { body: commands },
  );
  console.log("Guild commands registered.");
} else {
  console.log(`Registering ${commands.length} global commands...`);
  await rest.put(
    Routes.applicationCommands(config.discord.clientId),
    { body: commands },
  );
  console.log("Global commands registered (may take up to 1 hour).");
}
