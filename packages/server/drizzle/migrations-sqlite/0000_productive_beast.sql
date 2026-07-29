CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`kind` text DEFAULT 'image' NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`checksum` text NOT NULL,
	`uploaded_by` text,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_storage_key_uniq` ON `assets` (`storage_key`);--> statement-breakpoint
CREATE INDEX `assets_board_idx` ON `assets` (`board_id`);--> statement-breakpoint
CREATE TABLE `board_members` (
	`board_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`board_id`, `role`),
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "board_members_role_check" CHECK("board_members"."role" IN ('owner', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `yjs_documents` (
	`name` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`data` blob DEFAULT (x'') NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
