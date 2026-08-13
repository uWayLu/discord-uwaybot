import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

export async function upsertUser(entry: {
  id: string;
  guildId: string;
  displayName: string;
  now?: number;
}): Promise<void> {
  const now = entry.now ?? Date.now();
  let existing = await db
    .select()
    .from(users)
    .where(and(eq(users.id, entry.id), eq(users.guildId, entry.guildId)))
    .get();

  // 冪等新增：並發/重複呼叫時用 ON CONFLICT DO NOTHING 避免 UNIQUE 崩潰
  if (!existing) {
    try {
      const result = await db
        .insert(users)
        .values({
          id: entry.id,
          guildId: entry.guildId,
          displayName: entry.displayName,
          firstSeen: now,
          lastSeen: now,
          msgCount: 1,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
      if (result.changes === 1) return; // 已成功新增
      // changes === 0 → 已被並發插入，走下面的 update
    } catch (error) {
      if (isUniqueViolation(error)) {
        existing = undefined;
      } else {
        throw error;
      }
    }
  }

  const base = existing?.msgCount ?? 0;
  await db
    .update(users)
    .set({
      displayName: entry.displayName,
      lastSeen: now,
      msgCount: base + 1,
      updatedAt: now,
    })
    .where(and(eq(users.id, entry.id), eq(users.guildId, entry.guildId)));
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export async function getDisplayName(
  userId: string,
  guildId: string,
): Promise<string | undefined> {
  const row = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.guildId, guildId)))
    .get();
  return row?.displayName;
}
