import { Events } from "discord.js";
import type { Client } from "discord.js";
import { getRunningJobs, completeJob } from "../services/job-store.js";

async function recoverStaleJobs(): Promise<void> {
  try {
    const running = await getRunningJobs();
    for (const job of running) {
      await completeJob(
        job.id,
        "failed",
        "recovered: previous process restarted mid-job",
      );
      console.log(
        `[RECOVER] aborted stale backfill job ${job.id} (guild ${job.guildId})`,
      );
    }
  } catch (error) {
    console.error("[RECOVER] failed to scan stale jobs:", (error as Error).message);
  }
}

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client<true>) {
    console.log(`[BOT] Ready! Logged in as ${client.user.tag}`);
    console.log(`[BOT] Serving ${client.guilds.cache.size} guild(s)`);
    void recoverStaleJobs();
  },
};
