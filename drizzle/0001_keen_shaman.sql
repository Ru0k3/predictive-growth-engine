CREATE TABLE `analysis_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`modelVersion` varchar(64) NOT NULL,
	`result` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysis_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audience_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`channel` varchar(64) NOT NULL,
	`reach` bigint NOT NULL,
	`demographicVector` json NOT NULL,
	`observedAt` timestamp NOT NULL DEFAULT (now()),
	`source` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audience_snapshots_id` PRIMARY KEY(`id`)
);
