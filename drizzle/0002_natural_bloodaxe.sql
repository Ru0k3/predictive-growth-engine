CREATE TABLE `connected_channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`externalAccountId` varchar(128) NOT NULL,
	`accountName` varchar(255) NOT NULL,
	`accessTokenEncrypted` text NOT NULL,
	`refreshTokenEncrypted` text,
	`accessTokenExpiresAt` timestamp,
	`refreshTokenExpiresAt` timestamp,
	`scopes` text,
	`lastSyncedAt` timestamp,
	`status` varchar(32) NOT NULL DEFAULT 'connected',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `connected_channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`storageKey` text NOT NULL,
	`contentText` text,
	`structuralOutline` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `content_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidence_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`assetId` int NOT NULL,
	`eventType` varchar(32) NOT NULL,
	`position` varchar(64) NOT NULL,
	`magnitude` varchar(64) NOT NULL,
	`label` varchar(255) NOT NULL,
	`evidenceText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_events_id` PRIMARY KEY(`id`)
);
