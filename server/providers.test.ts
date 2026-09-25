import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, createProviderState, fetchAggregateSnapshot, ProviderApiError } from "./providers";
import { syncPolicy } from "./sync";

describe("provider security helpers", () => {
  it("round-trips encrypted tokens without storing plaintext", () => {
    process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = "test-only-key";
    const token = "access-token-secret-123";
    const encrypted = encryptSecret(token);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted)).toBe(token);
  });

  it("creates high-entropy OAuth state values", () => {
    const first = createProviderState();
    const second = createProviderState();
    expect(first).toHaveLength(43);
    expect(second).not.toBe(first);
  });

  it("preserves Retry-After metadata for rate-limited provider responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 429, headers: { "retry-after": "2" } })));
    await expect(fetchAggregateSnapshot("youtube", "token")).rejects.toMatchObject({ status: 429, retryAfterMs: 2000 });
    expect(syncPolicy.maxAttempts).toBe(3);
    expect(syncPolicy.maxBackoffMs).toBe(30000);
    expect(new ProviderApiError(429, "rate limited")).toBeInstanceOf(Error);
    vi.unstubAllGlobals();
  });

  afterEach(() => vi.unstubAllGlobals());
});
