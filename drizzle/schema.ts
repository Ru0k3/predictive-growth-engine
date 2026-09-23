import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  scheduleCron: varchar("scheduleCron", { length: 64 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const audienceSnapshots = mysqlTable("audience_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  channel: varchar("channel", { length: 64 }).notNull(),
  reach: bigint("reach", { mode: "number" }).notNull(),
  demographicVector: json("demographicVector").notNull(),
  observedAt: timestamp("observedAt").defaultNow().notNull(),
  source: varchar("source", { length: 128 }).notNull(),
  impressions: bigint("impressions", { mode: "number" }).default(0),
  followers: bigint("followers", { mode: "number" }).default(0),
  engagement: bigint("engagement", { mode: "number" }).default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const analysisRuns = mysqlTable("analysis_runs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  modelVersion: varchar("modelVersion", { length: 64 }).notNull(),
  result: json("result").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const connectedChannels = mysqlTable("connected_channels", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  externalAccountId: varchar("externalAccountId", { length: 128 }).notNull(),
  accountName: varchar("accountName", { length: 255 }).notNull(),
  accessTokenEncrypted: text("accessTokenEncrypted").notNull(),
  refreshTokenEncrypted: text("refreshTokenEncrypted"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scopes: text("scopes"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  status: varchar("status", { length: 32 }).default("connected").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const providerSettings = mysqlTable("provider_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  clientIdEncrypted: text("clientIdEncrypted").notNull(),
  clientSecretEncrypted: text("clientSecretEncrypted").notNull(),
  redirectUri: varchar("redirectUri", { length: 512 }),
  scopes: text("scopes"),
  enabled: int("enabled").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const contentAssets = mysqlTable("content_assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  storageKey: text("storageKey").notNull(),
  contentText: text("contentText"),
  structuralOutline: json("structuralOutline"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const evidenceEvents = mysqlTable("evidence_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  assetId: int("assetId").notNull(),
  eventType: varchar("eventType", { length: 32 }).notNull(),
  position: varchar("position", { length: 64 }).notNull(),
  magnitude: varchar("magnitude", { length: 64 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  evidenceText: text("evidenceText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AudienceSnapshot = typeof audienceSnapshots.$inferSelect;
export type AnalysisRun = typeof analysisRuns.$inferSelect;
export type ConnectedChannel = typeof connectedChannels.$inferSelect;
export type ContentAsset = typeof contentAssets.$inferSelect;
export type EvidenceEvent = typeof evidenceEvents.$inferSelect;
