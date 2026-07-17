import type { Collection } from "discord.js";
import type { Command } from "./interfaces.js";

declare module "discord.js" {
  export interface Client {
    commands: Collection<string, Command>;
  }
}
