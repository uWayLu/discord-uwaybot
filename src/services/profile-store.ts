import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { userProfiles } from "../db/schema.js";
import type { UserProfile } from "../llm/profile.js";

const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedProfile {
  profile: UserProfile;
  sampleCount: number;
  updatedAt: number;
  stale: boolean;
}

export async function getProfile(
  userId: string,
  guildId: string,
): Promise<CachedProfile | undefined> {
  const row = await db
    .select()
    .from(userProfiles)
    .where(and(eq(userProfiles.id, userId), eq(userProfiles.guildId, guildId)))
    .get();
  if (!row) return undefined;

  let profile: UserProfile;
  try {
    profile = JSON.parse(row.profileJson) as UserProfile;
  } catch {
    return undefined;
  }

  const stale = Date.now() - row.updatedAt > PROFILE_TTL_MS;
  return {
    profile,
    sampleCount: row.sampleCount,
    updatedAt: row.updatedAt,
    stale,
  };
}

export async function saveProfile(
  userId: string,
  guildId: string,
  profile: UserProfile,
  sampleCount: number,
): Promise<void> {
  const now = Date.now();
  await db
    .insert(userProfiles)
    .values({
      id: userId,
      guildId,
      profileJson: JSON.stringify(profile),
      sampleCount,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userProfiles.id, userProfiles.guildId],
      set: {
        profileJson: JSON.stringify(profile),
        sampleCount,
        updatedAt: now,
      },
    });
}
