import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  threadId: text("thread_id"),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
  replyTo: text("reply_to"),
  hasEmbed: integer("has_embed", { mode: "boolean" }).default(false),
}, (t) => [
  index("idx_messages_channel_time").on(t.channelId, t.createdAt),
  index("idx_messages_guild").on(t.guildId, t.createdAt),
]);

export const summaries = sqliteTable("summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
  summaryJson: text("summary_json").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  displayName: text("display_name").notNull(),
  firstSeen: integer("first_seen").notNull(),
  lastSeen: integer("last_seen").notNull(),
  msgCount: integer("msg_count").default(0).notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    id: text("id").notNull(),
    guildId: text("guild_id").notNull(),
    profileJson: text("profile_json").notNull(),
    sampleCount: integer("sample_count").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.id, t.guildId] })],
);

export const backfillJobs = sqliteTable("backfill_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  status: text("status", { enum: ["running", "done", "failed"] }).notNull(),
  channelsTotal: integer("channels_total").notNull().default(0),
  channelsDone: integer("channels_done").notNull().default(0),
  threadsTotal: integer("threads_total").notNull().default(0),
  threadsDone: integer("threads_done").notNull().default(0),
  messagesFetched: integer("messages_fetched").notNull().default(0),
  messagesInserted: integer("messages_inserted").notNull().default(0),
  error: text("error"),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
});

export const backfillCursors = sqliteTable("backfill_cursors", {
  channelId: text("channel_id").primaryKey(),
  guildId: text("guild_id").notNull(),
  lastMessageId: text("last_message_id").notNull(),
  lastFetchedAt: integer("last_fetched_at").notNull(),
});
