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
  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.id, entry.id), eq(users.guildId, entry.guildId)))
    .get();

  if (!existing) {
    await db.insert(users).values({
      id: entry.id,
      guildId: entry.guildId,
      displayName: entry.displayName,
      firstSeen: now,
      lastSeen: now,
      msgCount: 1,
      updatedAt: now,
    });
    return;
  }

  await db
    .update(users)
    .set({
      displayName: entry.displayName,
      lastSeen: now,
      msgCount: existing.msgCount + 1,
      updatedAt: now,
    })
    .where(and(eq(users.id, entry.id), eq(users.guildId, entry.guildId)));
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
