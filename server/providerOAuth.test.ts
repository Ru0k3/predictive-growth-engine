import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderState, decryptSecret, encryptSecret } from "./providers";
import { isSupportedProvider, refreshConnectionIfNeeded } from "./providerOAuth";
import * as db from "./db";

describe("provider OAuth state and token lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("creates high-entropy state tokens for durable storage", () => {
    const first = createProviderState();
    const second = createProviderState();
    expect(first).toHaveLength(43);
    expect(second).not.toBe(first);
  });

  it("accepts only supported provider cookie values", () => {
    expect(isSupportedProvider("youtube")).toBe(true);
    expect(isSupportedProvider("instagram")).toBe(true);
    expect(isSupportedProvider("tiktok")).toBe(true);
    expect(isSupportedProvider("evil-provider")).toBe(false);
    expect(isSupportedProvider(undefined)).toBe(false);
  });

  it("stores a rotated refresh token and preserves it when omitted", async () => {
    process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = "oauth-test-key";
    const update = vi.spyOn(db, "updateConnectedChannel").mockResolvedValue();
    const channel = {
      id: 3,
      provider: "youtube",
      accessTokenEncrypted: encryptSecret("old-access"),
      refreshTokenEncrypted: encryptSecret("old-refresh"),
      accessTokenExpiresAt: new Date(Date.now() - 1000),
      refreshTokenExpiresAt: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }), { status: 200 })));
    const rotated = await refreshConnectionIfNeeded(channel, { clientId: "client", clientSecret: "secret" });
    expect(decryptSecret(rotated.accessTokenEncrypted)).toBe("new-access");
    expect(update).toHaveBeenCalledWith(3, expect.objectContaining({ refreshTokenEncrypted: expect.any(String) }));
    expect(decryptSecret(update.mock.calls[0]?.[1].refreshTokenEncrypted as string)).toBe("new-refresh");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "newer-access", expires_in: 3600 }), { status: 200 })));
    await refreshConnectionIfNeeded({ ...channel, accessTokenExpiresAt: new Date(Date.now() - 1000) }, { clientId: "client", clientSecret: "secret" });
    expect(update.mock.calls[1]?.[1].refreshTokenEncrypted).toBe(channel.refreshTokenEncrypted);
  });
});
