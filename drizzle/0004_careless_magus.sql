ALTER TABLE `audience_snapshots` ADD `impressions` bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `audience_snapshots` ADD `followers` bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `audience_snapshots` ADD `engagement` bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `scheduleCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `users` ADD `scheduleCron` varchar(64);