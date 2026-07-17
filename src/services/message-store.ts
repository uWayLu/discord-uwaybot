import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages } from "../db/schema.js";

export interface StoredMessage {
  id: string;
  guildId: string;
  channelId: string;
  threadId: string | null;
  userId: string;
  content: string;
  createdAt: number;
  replyTo: string | null;
  hasEmbed: boolean;
}

export async function storeMessage(msg: {
  id: string;
  guildId: string;
  channelId: string;
  threadId: string | null;
  userId: string;
  content: string;
  createdAt: number;
  replyTo: string | null;
  hasEmbed: boolean;
}): Promise<void> {
  await db.insert(messages).values(msg).onConflictDoNothing();
}

export async function getMessagesInTimeRange(
  channelId: string,
  startMs: number,
  endMs: number,
): Promise<StoredMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.channelId, channelId),
        gte(messages.createdAt, startMs),
        lte(messages.createdAt, endMs),
      ),
    )
    .orderBy(messages.createdAt);

  return rows.map((r) => ({
    ...r,
    hasEmbed: r.hasEmbed ?? false,
  }));
}

export async function getRecentMessages(
  channelId: string,
  limit: number = 50,
): Promise<StoredMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.channelId, channelId))
    .orderBy(messages.createdAt)
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    hasEmbed: r.hasEmbed ?? false,
  }));
}

export async function getMessageById(id: string): Promise<StoredMessage | undefined> {
  const row = await db.select().from(messages).where(eq(messages.id, id)).get();
  if (!row) return undefined;
  return {
    ...row,
    hasEmbed: row.hasEmbed ?? false,
  };
}

export async function backfillMessages(
  channelId: string,
  messagesToStore: Array<{
    id: string;
    guildId: string;
    channelId: string;
    threadId: string | null;
    userId: string;
    content: string;
    createdAt: number;
    replyTo: string | null;
    hasEmbed: boolean;
  }>,
): Promise<number> {
  let inserted = 0;
  for (const msg of messagesToStore) {
    const existing = await db.select().from(messages).where(eq(messages.id, msg.id)).get();
    if (!existing) {
      await db.insert(messages).values(msg);
      inserted++;
    }
  }
  return inserted;
}
