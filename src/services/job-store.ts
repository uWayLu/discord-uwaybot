import { eq, desc, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { backfillJobs } from "../db/schema.js";

export type BackfillJobStatus = "running" | "done" | "failed";

export interface BackfillJob {
  id: number;
  guildId: string;
  status: BackfillJobStatus;
  channelsTotal: number;
  channelsDone: number;
  threadsTotal: number;
  threadsDone: number;
  messagesFetched: number;
  messagesInserted: number;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export async function createJob(guildId: string): Promise<BackfillJob> {
  const now = Date.now();
  const [row] = await db
    .insert(backfillJobs)
    .values({
      guildId,
      status: "running",
      startedAt: now,
    })
    .returning();
  return row as unknown as BackfillJob;
}

export async function getRunningJob(guildId: string): Promise<BackfillJob | undefined> {
  const row = await db
    .select()
    .from(backfillJobs)
    .where(eq(backfillJobs.guildId, guildId))
    .orderBy(desc(backfillJobs.id))
    .get();
  if (!row || row.status !== "running") return undefined;
  return row as unknown as BackfillJob;
}

export async function getRunningJobs(): Promise<BackfillJob[]> {
  const rows = await db
    .select()
    .from(backfillJobs)
    .where(eq(backfillJobs.status, "running"))
    .all();
  return rows as unknown as BackfillJob[];
}

export async function getLatestJob(guildId: string): Promise<BackfillJob | undefined> {
  const row = await db
    .select()
    .from(backfillJobs)
    .where(eq(backfillJobs.guildId, guildId))
    .orderBy(desc(backfillJobs.id))
    .get();
  if (!row) return undefined;
  return row as unknown as BackfillJob;
}

export async function updateJob(
  jobId: number,
  patch: Partial<BackfillJob>,
): Promise<void> {
  await db.update(backfillJobs).set(patch).where(eq(backfillJobs.id, jobId));
}

export async function completeJob(
  jobId: number,
  status: BackfillJobStatus,
  error?: string,
): Promise<void> {
  await db
    .update(backfillJobs)
    .set({ status, error: error ?? null, finishedAt: Date.now() })
    .where(eq(backfillJobs.id, jobId));
}

export async function setJobPlan(
  jobId: number,
  plan: { channelsTotal: number; threadsTotal: number },
): Promise<void> {
  await db
    .update(backfillJobs)
    .set(plan)
    .where(eq(backfillJobs.id, jobId));
}
