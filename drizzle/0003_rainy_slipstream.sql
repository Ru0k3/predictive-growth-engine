CREATE TABLE `provider_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`clientIdEncrypted` text NOT NULL,
	`clientSecretEncrypted` text NOT NULL,
	`redirectUri` varchar(512),
	`scopes` text,
	`enabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `provider_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `content_assets` ADD `metadata` json;