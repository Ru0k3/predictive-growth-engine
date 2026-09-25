ALTER TABLE `connected_channels` ADD `lastError` varchar(512);
--> statement-breakpoint
ALTER TABLE `connected_channels` ADD CONSTRAINT `connected_user_provider_unique` UNIQUE (`userId`,`provider`);
--> statement-breakpoint
CREATE INDEX `connected_user_status_idx` ON `connected_channels` (`userId`,`status`);
--> statement-breakpoint
ALTER TABLE `provider_settings` ADD CONSTRAINT `provider_settings_user_provider_unique` UNIQUE (`userId`,`provider`);
