CREATE TABLE `maintenance_leases` (
  `lockName` varchar(64) NOT NULL,
  `leaseToken` varchar(128) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lockName`),
  KEY `maintenance_leases_expiry_idx` (`expiresAt`)
);
