import { desc, eq, and, gt, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, connectedChannels, contentAssets, evidenceEvents, audienceSnapshots, providerSettings } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listConnectedChannels(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: connectedChannels.id,
    provider: connectedChannels.provider,
    externalAccountId: connectedChannels.externalAccountId,
    accountName: connectedChannels.accountName,
    scopes: connectedChannels.scopes,
    accessTokenExpiresAt: connectedChannels.accessTokenExpiresAt,
    lastSyncedAt: connectedChannels.lastSyncedAt,
    status: connectedChannels.status,
    lastError: connectedChannels.lastError,
  }).from(connectedChannels).where(eq(connectedChannels.userId, userId)).orderBy(desc(connectedChannels.updatedAt));
}

export async function createAudienceSnapshot(values: typeof audienceSnapshots.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(audienceSnapshots).values(values);
}

export async function listAudienceSnapshots(userId: number, days = 90, channel?: string, from?: Date, to?: Date) {
  const db = await getDb();
  if (!db) return [];
  const since = from ?? new Date(Date.now() - days * 86400000);
  const until = to ?? new Date();
  const filters = channel ? and(eq(audienceSnapshots.userId, userId), eq(audienceSnapshots.channel, channel), gt(audienceSnapshots.observedAt, since), lt(audienceSnapshots.observedAt, until)) : and(eq(audienceSnapshots.userId, userId), gt(audienceSnapshots.observedAt, since), lt(audienceSnapshots.observedAt, until));
  return db.select().from(audienceSnapshots).where(filters).orderBy(audienceSnapshots.observedAt);
}

export async function listLatestAudienceSnapshots(userId: number) {
  const rows = await listAudienceSnapshots(userId, 365);
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const previous = latest.get(row.channel);
    if (!previous || row.observedAt.getTime() > previous.observedAt.getTime()) latest.set(row.channel, row);
  }
  return Array.from(latest.values());
}

export async function updateUserSchedule(userId: number, values: { scheduleCronTaskUid?: string | null; scheduleCron?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ ...values, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function getUserByScheduleTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.scheduleCronTaskUid, taskUid)).limit(1);
  return rows[0];
}

export async function getConnectedChannel(userId: number, provider: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(connectedChannels).where(and(eq(connectedChannels.userId, userId), eq(connectedChannels.provider, provider))).limit(1);
  return rows[0];
}

export async function getConnectedChannelById(userId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(connectedChannels).where(and(eq(connectedChannels.userId, userId), eq(connectedChannels.id, id))).limit(1);
  return rows[0];
}

export async function listProviderSettings(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: providerSettings.id, provider: providerSettings.provider, redirectUri: providerSettings.redirectUri, scopes: providerSettings.scopes, enabled: providerSettings.enabled, updatedAt: providerSettings.updatedAt }).from(providerSettings).where(eq(providerSettings.userId, userId)).orderBy(desc(providerSettings.updatedAt));
}

export async function getProviderSettings(userId: number, provider: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(providerSettings).where(and(eq(providerSettings.userId, userId), eq(providerSettings.provider, provider))).limit(1);
  return rows[0];
}

export async function upsertProviderSettings(values: typeof providerSettings.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ id: providerSettings.id }).from(providerSettings).where(and(eq(providerSettings.userId, values.userId), eq(providerSettings.provider, values.provider ?? ""))).limit(1);
  const updateSet = { clientIdEncrypted: values.clientIdEncrypted, clientSecretEncrypted: values.clientSecretEncrypted, redirectUri: values.redirectUri, scopes: values.scopes, enabled: values.enabled ?? 1, updatedAt: new Date() };
  if (existing[0]) await db.update(providerSettings).set(updateSet).where(eq(providerSettings.id, existing[0].id));
  else await db.insert(providerSettings).values(values);
}

export async function deleteProviderSettings(userId: number, provider: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(providerSettings).where(and(eq(providerSettings.userId, userId), eq(providerSettings.provider, provider)));
}

export async function upsertConnectedChannel(values: typeof connectedChannels.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ id: connectedChannels.id }).from(connectedChannels)
    .where(and(eq(connectedChannels.userId, values.userId), eq(connectedChannels.provider, values.provider ?? ""))).limit(1);
  const updateSet = {
    externalAccountId: values.externalAccountId,
    accountName: values.accountName,
    accessTokenEncrypted: values.accessTokenEncrypted,
    refreshTokenEncrypted: values.refreshTokenEncrypted,
    accessTokenExpiresAt: values.accessTokenExpiresAt,
    refreshTokenExpiresAt: values.refreshTokenExpiresAt,
    scopes: values.scopes,
    status: "connected" as const,
    lastError: null,
    lastSyncedAt: values.lastSyncedAt,
    updatedAt: new Date(),
  };
  if (existing[0]) await db.update(connectedChannels).set(updateSet).where(eq(connectedChannels.id, existing[0].id));
  else await db.insert(connectedChannels).values(values);
}

export async function updateConnectedChannel(id: number, values: Partial<typeof connectedChannels.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(connectedChannels).set({ ...values, updatedAt: new Date() }).where(eq(connectedChannels.id, id));
}

export async function deleteConnectedChannel(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(connectedChannels).where(and(eq(connectedChannels.userId, userId), eq(connectedChannels.id, id)));
}

export async function createContentAsset(values: typeof contentAssets.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(contentAssets).values(values);
  return Number(result[0].insertId);
}

export async function getContentAsset(userId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(contentAssets).where(and(eq(contentAssets.userId, userId), eq(contentAssets.id, id))).limit(1);
  return rows[0];
}

export async function updateContentAsset(userId: number, id: number, values: Partial<typeof contentAssets.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(contentAssets).set(values).where(and(eq(contentAssets.userId, userId), eq(contentAssets.id, id)));
}

export async function listContentAssets(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contentAssets).where(eq(contentAssets.userId, userId)).orderBy(desc(contentAssets.createdAt));
}

export async function createEvidenceEvents(values: Array<typeof evidenceEvents.$inferInsert>) {
  const db = await getDb();
  if (!db || values.length === 0) return;
  await db.insert(evidenceEvents).values(values);
}

export async function listEvidenceEvents(userId: number, assetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(evidenceEvents).where(and(eq(evidenceEvents.userId, userId), eq(evidenceEvents.assetId, assetId))).orderBy(evidenceEvents.position);
}
