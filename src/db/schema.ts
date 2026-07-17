import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

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
