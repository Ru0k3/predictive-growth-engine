import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, createProviderState } from "./providers";

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
});
