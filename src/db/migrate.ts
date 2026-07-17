import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index.js";

console.log("[DB] Running migrations...");
migrate(db, { migrationsFolder: "./drizzle" });
console.log("[DB] Migrations complete.");
