ALTER TABLE `memos` ADD `deleted_at` integer;
--> statement-breakpoint
CREATE INDEX `memos_creator_deleted_idx` ON `memos` (`creator_id`,`deleted_at`,`created_at`);
--> statement-breakpoint
CREATE TABLE `memo_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`memo_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`content` text NOT NULL,
	`visibility` text NOT NULL,
	`state` text NOT NULL,
	`pinned` integer NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`memo_id`) REFERENCES `memos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memo_versions_memo_version_unique` ON `memo_versions` (`memo_id`,`version`);--> statement-breakpoint
CREATE INDEX `memo_versions_memo_created_idx` ON `memo_versions` (`memo_id`,`created_at`);
