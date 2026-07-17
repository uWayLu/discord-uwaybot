import type { Client } from "discord.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function loadEvents(eventsDir: string, client: Client): Promise<void> {
  const files = await readdir(eventsDir);

  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;

    const event = await import(join(eventsDir, file));
    const { name, once, execute } = event.default;

    if (once) {
      client.once(name, (...args: unknown[]) => execute(...args));
    } else {
      client.on(name, (...args: unknown[]) => execute(...args));
    }
    console.log(`[EVT] Loaded: ${name} ${once ? "(once)" : ""}`);
  }
}
