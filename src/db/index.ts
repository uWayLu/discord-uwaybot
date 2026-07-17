import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema.js";

const DB_DIR = join(import.meta.dirname, "..", "..", "data");
const DB_PATH = join(DB_DIR, "bot.db");

mkdirSync(DB_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = normal");

export const db = drizzle(sqlite, { schema });
