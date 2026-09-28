import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { getCoordinationCleanupConfig, runCoordinationCleanup } from "./coordinationCleanup";

describe("coordination cleanup scheduler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.COORDINATION_CLEANUP_INTERVAL_MS;
    delete process.env.COORDINATION_CLEANUP_BATCH_SIZE;
  });

  it("clamps interval and batch configuration to safe bounds", () => {
    process.env.COORDINATION_CLEANUP_INTERVAL_MS = "1";
    process.env.COORDINATION_CLEANUP_BATCH_SIZE = "999999";
    expect(getCoordinationCleanupConfig()).toEqual({ intervalMs: 60_000, batchSize: 1000 });
  });

  it("runs bounded cleanup and returns safe counts", async () => {
    process.env.COORDINATION_CLEANUP_BATCH_SIZE = "25";
    const cleanup = vi.spyOn(db, "cleanupExpiredCoordinationRecords").mockResolvedValue({ oauthStates: 4, syncLeases: 3 });
    await expect(runCoordinationCleanup()).resolves.toEqual({ oauthStates: 4, syncLeases: 3 });
    expect(cleanup).toHaveBeenCalledWith(25);
  });

  it("contains cleanup failures without throwing", async () => {
    vi.spyOn(db, "cleanupExpiredCoordinationRecords").mockRejectedValue(new Error("database unavailable"));
    await expect(runCoordinationCleanup()).resolves.toEqual({ oauthStates: 0, syncLeases: 0 });
  });
});
