CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`thread_id` text,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`reply_to` text,
	`has_embed` integer DEFAULT false
);
--> statement-breakpoint
CREATE INDEX `idx_messages_channel_time` ON `messages` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_messages_guild` ON `messages` (`guild_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` integer NOT NULL
);
