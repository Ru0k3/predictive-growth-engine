import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import * as providers from "./providers";

function createContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createAuthenticatedContext(): TrpcContext {
  return {
    ...createContext(),
    user: { id: 7, openId: "user-7", name: "Test User", email: "test@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), scheduleCronTaskUid: null, scheduleCron: null },
  };
}

describe("analysis procedures", () => {
  it("returns a populated, privacy-first dashboard snapshot", async () => {
    const caller = appRouter.createCaller(createContext());
    const snapshot = await caller.analysis.dashboard();

    expect(snapshot.result.modelVersion).toBe("growth-engine-v1");
    expect(snapshot.result.estimatedUniqueReach).toBeGreaterThan(0);
    expect(snapshot.channels).toHaveLength(4);
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(snapshot.freshness).toContain("Demo fixture");
  });

  it("accepts a custom seeded simulation payload", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.analysis.simulate({
      channels: [
        { name: "A", reach: 1000, demographics: [0.9, 0.1] },
        { name: "B", reach: 900, demographics: [0.8, 0.2] },
      ],
      coefficient: 0.7,
      variance: 0.05,
      simulations: 250,
      seed: 7,
    });

    expect(result.interval.confidence).toBe(0.95);
    expect(result.interval.low).toBeLessThanOrEqual(result.interval.high);
    expect(result.assumptions).toHaveLength(3);
  });

  it("reads persisted snapshots without calling provider APIs", async () => {
    vi.spyOn(db, "listConnectedChannels").mockResolvedValue([{ id: 1, provider: "youtube", externalAccountId: "channel-1", accountName: "Test channel", scopes: null, accessTokenExpiresAt: null, lastSyncedAt: new Date(), status: "connected", lastError: null }]);
    vi.spyOn(db, "listLatestAudienceSnapshots").mockResolvedValue([{ id: 1, userId: 7, channel: "youtube", reach: 1000, demographicVector: [], observedAt: new Date("2026-09-25T10:00:00Z"), source: "test", impressions: 1200, followers: 100, engagement: 0, createdAt: new Date() }]);
    const providerFetch = vi.spyOn(providers, "fetchAggregateSnapshot");
    const snapshot = await appRouter.createCaller(createAuthenticatedContext()).analysis.dashboard();
    expect(snapshot.freshness).toContain("Persisted provider snapshots");
    expect(snapshot.channels[0]?.reach).toBe(1000);
    expect(providerFetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());
});
