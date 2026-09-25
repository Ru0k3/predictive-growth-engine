import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderApiError, encryptSecret } from "./providers";
import * as db from "./db";
import * as providers from "./providers";
import { syncConnectedChannel, withRetry } from "./sync";

describe("controlled provider sync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([408, 429, 500, 502, 503, 504])("retries transient HTTP %s responses", async (status) => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new ProviderApiError(status, "temporary"))
      .mockResolvedValue("ok");
    const delays: number[] = [];
    await expect(withRetry(operation, async (ms) => { delays.push(ms); })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(delays.length).toBe(1);
  });

  it("honors a bounded Retry-After delay", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new ProviderApiError(429, "limited", 2000))
      .mockResolvedValue("ok");
    const delays: number[] = [];
    await withRetry(operation, async (ms) => { delays.push(ms); });
    expect(delays).toEqual([2000]);

    const capped = vi.fn()
      .mockRejectedValueOnce(new ProviderApiError(429, "limited", 999999))
      .mockResolvedValue("ok");
    const cappedDelays: number[] = [];
    await withRetry(capped, async (ms) => { cappedDelays.push(ms); });
    expect(cappedDelays).toEqual([30000]);
  });

  it.each([400, 401, 403])("does not retry permanent HTTP %s errors", async (status) => {
    const operation = vi.fn().mockRejectedValue(new ProviderApiError(status, "permanent"));
    await expect(withRetry(operation, async () => undefined)).rejects.toMatchObject({ status });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("prevents overlapping syncs for the same user and provider", async () => {
    process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = "sync-test-key";
    vi.spyOn(db, "getConnectedChannel").mockResolvedValue({ id: 8, userId: 4, provider: "youtube", externalAccountId: "channel", accountName: "Channel", accessTokenEncrypted: encryptSecret("access"), refreshTokenEncrypted: null, accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), refreshTokenExpiresAt: null, scopes: null, lastSyncedAt: null, status: "connected", lastError: null, createdAt: new Date(), updatedAt: new Date() });
    vi.spyOn(db, "createAudienceSnapshot").mockResolvedValue();
    vi.spyOn(db, "updateConnectedChannel").mockResolvedValue();
    const fetchSnapshot = vi.spyOn(providers, "fetchAggregateSnapshot").mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { provider: "youtube", externalAccountId: "channel", accountName: "Channel", reach: 1, impressions: 1, followers: 1, engagement: 0, demographicVector: [], observedAt: new Date().toISOString(), source: "test" };
    });
    const [first, second] = await Promise.all([
      syncConnectedChannel(4, "youtube", undefined, { force: true }),
      syncConnectedChannel(4, "youtube", undefined, { force: true }),
    ]);
    expect([first.skipped, second.skipped].filter(Boolean)).toHaveLength(1);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });
});
