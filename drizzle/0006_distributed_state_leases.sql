CREATE TABLE `oauth_states` (
  `state` varchar(128) NOT NULL,
  `userId` int NOT NULL,
  `provider` varchar(32) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`state`),
  KEY `oauth_states_expiry_idx` (`expiresAt`),
  KEY `oauth_states_user_provider_idx` (`userId`,`provider`)
);
--> statement-breakpoint
CREATE TABLE `sync_leases` (
  `userId` int NOT NULL,
  `provider` varchar(32) NOT NULL,
  `leaseToken` varchar(128) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`,`provider`),
  KEY `sync_leases_expiry_idx` (`expiresAt`)
);
