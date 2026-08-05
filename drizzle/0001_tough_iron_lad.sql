CREATE TABLE `backfill_cursors` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`last_message_id` text NOT NULL,
	`last_fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backfill_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`status` text NOT NULL,
	`channels_total` integer DEFAULT 0 NOT NULL,
	`channels_done` integer DEFAULT 0 NOT NULL,
	`threads_total` integer DEFAULT 0 NOT NULL,
	`threads_done` integer DEFAULT 0 NOT NULL,
	`messages_fetched` integer DEFAULT 0 NOT NULL,
	`messages_inserted` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` text NOT NULL,
	`guild_id` text NOT NULL,
	`profile_json` text NOT NULL,
	`sample_count` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`id`, `guild_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`display_name` text NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`msg_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
