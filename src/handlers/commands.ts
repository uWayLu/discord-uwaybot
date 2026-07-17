import { Collection } from "discord.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "../types/interfaces.js";

function isValidCommand(obj: unknown): obj is Command {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "data" in obj &&
    "execute" in obj &&
    typeof (obj as Command).execute === "function"
  );
}

async function importCommand(filePath: string, commands: Collection<string, Command>) {
  const imported = await import(filePath);
  const cmd = imported.default;
  if (isValidCommand(cmd)) {
    commands.set(cmd.data.name, cmd);
    console.log(`[CMD] Loaded: /${cmd.data.name}`);
  } else {
    console.warn(`[CMD] Invalid command at ${filePath}`);
  }
}

export async function loadCommands(
  commandsDir: string,
): Promise<Collection<string, Command>> {
  const commands = new Collection<string, Command>();
  const entries = await readdir(commandsDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(commandsDir, entry.name);

    if (entry.isDirectory()) {
      const files = await readdir(fullPath);
      for (const file of files) {
        if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;
        await importCommand(join(fullPath, file), commands);
      }
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
      await importCommand(fullPath, commands);
    }
  }

  console.log(`[CMD] Total loaded: ${commands.size}`);
  return commands;
}
