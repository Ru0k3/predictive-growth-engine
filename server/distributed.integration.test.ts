import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { encryptSecret, type AggregateSnapshot } from "./providers";
import * as db from "./db";
import * as providers from "./providers";
import { syncConnectedChannel } from "./sync";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

integration("distributed sync coordination against a real MySQL/TiDB database", () => {
  let connection!: mysql.Connection;
  const userId = 700000 + (Date.now() % 10000);
  const provider = "youtube" as const;
  const snapshot: AggregateSnapshot = {
    provider,
    externalAccountId: "integration-account",
    accountName: "Integration account",
    reach: 10,
    impressions: 20,
    followers: 30,
    engagement: 4,
    demographicVector: [],
    observedAt: new Date().toISOString(),
    source: "integration-test",
  };

  beforeAll(async () => {
    process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = "integration-only-test-key";
    connection = await mysql.createConnection(databaseUrl!);
    await connection.execute("SELECT 1 FROM sync_leases LIMIT 1");
    await connection.execute("SELECT 1 FROM oauth_states LIMIT 1");
    await connection.execute("DELETE FROM audience_snapshots WHERE userId = ?", [userId]);
    await connection.execute("DELETE FROM connected_channels WHERE userId = ?", [userId]);
    await connection.execute("DELETE FROM sync_leases WHERE userId = ?", [userId]);
    await connection.execute("DELETE FROM oauth_states WHERE userId = ?", [userId]);
    await db.upsertConnectedChannel({
      userId,
      provider,
      externalAccountId: "integration-account",
      accountName: "Integration account",
      accessTokenEncrypted: encryptSecret("integration-access-token"),
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenExpiresAt: null,
      scopes: "test",
      lastSyncedAt: null,
      status: "connected",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await connection.execute("DELETE FROM audience_snapshots WHERE userId = ?", [userId]);
    await connection.execute("DELETE FROM connected_channels WHERE userId = ?", [userId]);
    await connection.execute("DELETE FROM sync_leases WHERE userId = ?", [userId]);
    await connection.execute("DELETE FROM oauth_states WHERE userId = ?", [userId]);
    await connection.end();
  });

  it("allows only one competing worker to perform a long sync while renewal keeps ownership", async () => {
    const providerFetch = vi.spyOn(providers, "fetchAggregateSnapshot").mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return snapshot;
    });
    const options = { force: true, leaseDurationMs: 100, leaseRenewalIntervalMs: 25 };
    const first = syncConnectedChannel(userId, provider, undefined, options);
    await new Promise((resolve) => setTimeout(resolve, 160));
    const second = await syncConnectedChannel(userId, provider, undefined, options);
    const firstResult = await first;

    expect(second.skipped).toBe(true);
    expect(firstResult.ok).toBe(true);
    expect(providerFetch).toHaveBeenCalledTimes(1);
    const [rows] = await connection.execute<any[]>("SELECT COUNT(*) AS count FROM audience_snapshots WHERE userId = ? AND source = ?", [userId, "integration-test"]);
    expect(Number(rows[0].count)).toBe(1);
  });

  it("renews and releases only with the current lease token", async () => {
    const token = await db.acquireSyncLease(userId, "instagram", 500);
    expect(token).toEqual(expect.any(String));
    expect(await db.renewSyncLease(userId, "instagram", "wrong-token", 500)).toBe(false);
    expect(await db.renewSyncLease(userId, "instagram", token!, 500)).toBe(true);
    expect(await db.releaseSyncLease(userId, "instagram", "wrong-token")).toBe(false);
    expect(await db.releaseSyncLease(userId, "instagram", token!)).toBe(true);
    expect(await db.renewSyncLease(userId, "instagram", token!, 500)).toBe(false);
  });

  it("cleans only expired coordination records", async () => {
    await db.createOAuthState({ state: `expired-${userId}`, userId, provider: "youtube", expiresAt: new Date(Date.now() - 1000) });
    await db.createOAuthState({ state: `active-${userId}`, userId, provider: "youtube", expiresAt: new Date(Date.now() + 60_000) });
    const expiredLease = await db.acquireSyncLease(userId, "tiktok", -1000);
    expect(expiredLease).toEqual(expect.any(String));
    const activeLease = await db.acquireSyncLease(userId, "instagram", 60_000);
    expect(activeLease).toEqual(expect.any(String));

    await db.cleanupExpiredCoordinationRecords(100);
    const [oauthRows] = await connection.execute<any[]>("SELECT state FROM oauth_states WHERE userId = ? ORDER BY state", [userId]);
    const [leaseRows] = await connection.execute<any[]>("SELECT provider FROM sync_leases WHERE userId = ? ORDER BY provider", [userId]);
    expect(oauthRows.map((row) => row.state)).toEqual([`active-${userId}`]);
    expect(leaseRows.map((row) => row.provider)).toEqual(["instagram"]);
  });
});
