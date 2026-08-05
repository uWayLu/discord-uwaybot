import { eq } from "drizzle-orm";
import {
  ChannelType,
  type Guild,
  type ThreadChannel,
  type TextChannel,
  type NewsChannel,
  type ForumChannel,
} from "discord.js";
import { db } from "../db/index.js";
import { backfillCursors } from "../db/schema.js";
import { backfillMessagesBulk, type MessageInput } from "./message-store.js";
import { updateJob, completeJob, setJobPlan } from "./job-store.js";

const CONCURRENCY = 3;
const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 250;

export interface BackfillOptions {
  startMs: number;
  endMs: number;
  mode: "auto" | "full" | "incremental";
}

interface CrawlUnit {
  id: string;
  guildId: string;
  isThread: boolean;
  label: string;
}

interface MessageLike {
  id: string;
  content: string;
  createdTimestamp: number;
  author: { id: string; bot?: boolean };
  reference: { messageId: string } | null;
  embeds: unknown[];
  type: number;
}

type FetchTarget = {
  id: string;
  messages: {
    fetch: (opts: {
      limit: number;
      before?: string;
      after?: string;
    }) => Promise<Map<string, MessageLike>>;
  };
};

type ThreadProvider = {
  threads: {
    fetchActive: () => Promise<{ threads: Map<string, ThreadChannel> }>;
    fetchArchived: (opts: {
      type?: "public" | "private";
      before?: Date | string;
    }) => Promise<{ threads: Map<string, ThreadChannel>; hasMore: boolean }>;
  };
};

const MESSAGE_TYPE_KEEP = new Set([0, 19]);

function compareId(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function toMessageInput(
  msg: MessageLike,
  guildId: string,
  channelId: string,
): MessageInput | null {
  if (msg.author.bot) return null;
  if (!MESSAGE_TYPE_KEEP.has(msg.type)) return null;

  return {
    id: msg.id,
    guildId,
    channelId,
    threadId: null,
    userId: msg.author.id,
    content: msg.content,
    createdAt: msg.createdTimestamp,
    replyTo: msg.reference?.messageId ?? null,
    hasEmbed: msg.embeds.length > 0,
  };
}

export async function getCursor(channelId: string): Promise<string | null> {
  const row = await db
    .select()
    .from(backfillCursors)
    .where(eq(backfillCursors.channelId, channelId))
    .get();
  return row?.lastMessageId ?? null;
}

export async function setCursor(
  channelId: string,
  guildId: string,
  lastMessageId: string,
): Promise<void> {
  await db
    .insert(backfillCursors)
    .values({ channelId, guildId, lastMessageId, lastFetchedAt: Date.now() })
    .onConflictDoUpdate({
      target: backfillCursors.channelId,
      set: { lastMessageId, lastFetchedAt: Date.now() },
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(
  channel: FetchTarget,
  opts: { before?: string; after?: string },
): Promise<MessageLike[]> {
  try {
    const fetched = await channel.messages.fetch({
      limit: PAGE_SIZE,
      before: opts.before,
      after: opts.after,
    });
    return Array.from(fetched.values());
  } catch (error) {
    console.error("[BACKFILL] fetch failed:", (error as Error).message);
    return [];
  }
}

async function crawlChannelMessages(
  channel: FetchTarget,
  guildId: string,
  options: BackfillOptions,
  cursor: string | null,
): Promise<{ fetched: number; inserted: number; newestId: string | null }> {
  const all: MessageLike[] = [];
  const useIncremental =
    options.mode !== "full" && cursor !== null && options.endMs >= Date.now() - 60_000;

  if (useIncremental) {
    let done = false;
    let beforeId: string | undefined;
    while (!done) {
      const batch = await fetchPage(
        channel,
        beforeId ? { before: beforeId } : { after: cursor! },
      );
      if (batch.length === 0) break;

      const newest = batch[0]!;
      if (compareId(newest.id, cursor!) <= 0) break;

      all.push(...batch.filter((m) => m.createdTimestamp <= options.endMs));

      const oldest = batch[batch.length - 1]!;
      if (batch.length < PAGE_SIZE) {
        done = true;
      } else {
        beforeId = oldest.id;
      }
      await sleep(PAGE_DELAY_MS);
    }
  } else {
    let done = false;
    let beforeId: string | undefined;
    while (!done) {
      const batch = await fetchPage(channel, { before: beforeId });
      if (batch.length === 0) break;

      all.push(
        ...batch.filter(
          (m) => m.createdTimestamp >= options.startMs && m.createdTimestamp <= options.endMs,
        ),
      );

      const oldest = batch[batch.length - 1]!;
      if (oldest.createdTimestamp < options.startMs || batch.length < PAGE_SIZE) {
        done = true;
      } else {
        beforeId = oldest.id;
      }
      await sleep(PAGE_DELAY_MS);
    }
  }

  all.sort((a, b) => compareId(a.id, b.id));
  const inputs = all
    .map((m) => toMessageInput(m, guildId, channel.id))
    .filter((m): m is MessageInput => m !== null);

  let inserted = 0;
  if (inputs.length > 0) {
    inserted = await backfillMessagesBulk(inputs);
  }

  const newestId = all.length > 0 ? all[all.length - 1]!.id : null;
  return { fetched: all.length, inserted, newestId };
}

async function collectThreads(channel: ThreadProvider): Promise<ThreadChannel[]> {
  const threads: ThreadChannel[] = [];

  try {
    const active = await channel.threads.fetchActive();
    threads.push(...Array.from(active.threads.values()));
  } catch (error) {
    console.warn("[BACKFILL] fetchActive failed:", (error as Error).message);
  }

  for (const type of ["public", "private"] as const) {
    try {
      let before: Date | undefined;
      let hasMore = true;
      while (hasMore) {
        const archived = await channel.threads.fetchArchived({ type, before });
        const list = Array.from(archived.threads.values());
        threads.push(...list);
        hasMore = archived.hasMore && list.length > 0;
        if (hasMore) {
          const last = list[list.length - 1]!;
          before = last.archivedAt ?? last.createdAt ?? new Date();
        }
        await sleep(PAGE_DELAY_MS);
      }
    } catch (error) {
      console.warn(`[BACKFILL] fetchArchived(${type}) failed (skip):`, (error as Error).message);
    }
  }

  return threads;
}

export async function runBackfill(
  guild: Guild,
  jobId: number,
  options: BackfillOptions,
): Promise<void> {
  const guildId = guild.id;
  const stats = {
    messagesFetched: 0,
    messagesInserted: 0,
    channelsDone: 0,
    threadsDone: 0,
  };

  try {
    const channelCollection = await guild.channels.fetch();
    const units: CrawlUnit[] = [];
    const threadLookup = new Map<string, ThreadChannel>();

    for (const ch of channelCollection.values()) {
      if (!ch) continue;
      if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
        const channel = ch as TextChannel | NewsChannel;
        const name = ch.name;
        units.push({ id: ch.id, guildId, isThread: false, label: `#${name}` });

        const threads = await collectThreads(channel as unknown as ThreadProvider);
        for (const t of threads) {
          threadLookup.set(t.id, t);
          units.push({ id: t.id, guildId, isThread: true, label: `#${t.name}` });
        }
      } else if (ch.type === ChannelType.GuildForum || ch.type === ChannelType.GuildMedia) {
        const forum = ch as ForumChannel;
        const threads = await collectThreads(forum as unknown as ThreadProvider);
        for (const t of threads) {
          threadLookup.set(t.id, t);
          units.push({ id: t.id, guildId, isThread: true, label: `#${t.name}` });
        }
      }
    }

    const channelsTotal = units.filter((u) => !u.isThread).length;
    const threadsTotal = units.filter((u) => u.isThread).length;
    await setJobPlan(jobId, { channelsTotal, threadsTotal });

    const persist = async (): Promise<void> => {
      await updateJob(jobId, {
        messagesFetched: stats.messagesFetched,
        messagesInserted: stats.messagesInserted,
        channelsDone: stats.channelsDone,
        threadsDone: stats.threadsDone,
      });
    };

    let idx = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const i = idx++;
        if (i >= units.length) return;

        const unit = units[i]!;
        try {
          const channel =
            threadLookup.get(unit.id) ?? (await guild.channels.fetch(unit.id));
          if (!channel || !("messages" in channel)) {
            if (unit.isThread) stats.threadsDone++;
            else stats.channelsDone++;
            await persist();
            continue;
          }

          const cursor = await getCursor(unit.id);
          const result = await crawlChannelMessages(
            channel as unknown as FetchTarget,
            guildId,
            options,
            cursor,
          );

          if (result.newestId) {
            await setCursor(unit.id, guildId, result.newestId);
          }

          stats.messagesFetched += result.fetched;
          stats.messagesInserted += result.inserted;
          if (unit.isThread) stats.threadsDone++;
          else stats.channelsDone++;

          await persist();
        } catch (error) {
          console.error(`[BACKFILL] channel ${unit.label} failed:`, error);
          if (unit.isThread) stats.threadsDone++;
          else stats.channelsDone++;
          await persist();
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, Math.max(units.length, 1)) },
      () => worker(),
    );
    await Promise.all(workers);

    await persist();
    await completeJob(jobId, "done");
    console.log(
      `[BACKFILL] Done. fetched=${stats.messagesFetched} inserted=${stats.messagesInserted} channels=${stats.channelsDone}/${channelsTotal} threads=${stats.threadsDone}/${threadsTotal}`,
    );
  } catch (error) {
    console.error("[BACKFILL] job failed:", error);
    await completeJob(jobId, "failed", (error as Error).message);
  }
}
