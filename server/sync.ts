import * as db from "./db";
import { decryptSecret, fetchAggregateSnapshot, Provider, ProviderApiError, ProviderCredentials } from "./providers";
import { refreshConnectionIfNeeded } from "./providerOAuth";

const MAX_ATTEMPTS = 3;
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 1000;
const LEASE_DURATION_MS = 2 * 60 * 1000;
const LEASE_RENEWAL_INTERVAL_MS = 30 * 1000;

class LeaseOwnershipLostError extends Error {
  constructor() {
    super("Sync lease ownership was lost before the provider result could be persisted.");
    this.name = "LeaseOwnershipLostError";
  }
}

export type SyncResult = {
  provider: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

function errorMessage(error: unknown) {
  return String(error instanceof Error ? error.message : error).replace(/\s+/g, " ").slice(0, 512);
}

function retryDelay(error: unknown, attempt: number) {
  if (error instanceof ProviderApiError && error.retryAfterMs) return Math.min(error.retryAfterMs, MAX_BACKOFF_MS);
  return Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

function retryable(error: unknown) {
  return error instanceof ProviderApiError && (error.status === 408 || error.status === 429 || error.status >= 500);
}

export async function withRetry<T>(operation: () => Promise<T>, sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!retryable(error) || attempt === MAX_ATTEMPTS) throw error;
      await sleep(retryDelay(error, attempt));
    }
  }
  throw new Error("Sync retry loop exhausted.");
}

export async function syncConnectedChannel(
  userId: number,
  provider: Provider,
  credentials?: ProviderCredentials,
  options: { force?: boolean; leaseDurationMs?: number; leaseRenewalIntervalMs?: number } = {},
): Promise<SyncResult> {
  const channel = await db.getConnectedChannel(userId, provider);
  if (!channel) return { provider, ok: false, error: "Connected channel not found." };
  if (!options.force && channel.lastSyncedAt && Date.now() - channel.lastSyncedAt.getTime() < MIN_SYNC_INTERVAL_MS) {
    return { provider, ok: true, skipped: true };
  }
  const leaseDurationMs = options.leaseDurationMs ?? LEASE_DURATION_MS;
  const leaseRenewalIntervalMs = options.leaseRenewalIntervalMs ?? Math.min(LEASE_RENEWAL_INTERVAL_MS, Math.floor(leaseDurationMs / 2));
  const leaseToken = await db.acquireSyncLease(userId, provider, leaseDurationMs);
  if (!leaseToken) return { provider, ok: true, skipped: true };
  let leaseLost = false;
  let renewalInFlight = false;
  const renewLease = async () => {
    if (leaseLost || renewalInFlight) return;
    renewalInFlight = true;
    try {
      if (!await db.renewSyncLease(userId, provider, leaseToken, leaseDurationMs)) leaseLost = true;
    } catch {
      leaseLost = true;
    } finally {
      renewalInFlight = false;
    }
  };
  const heartbeat = setInterval(() => { void renewLease(); }, leaseRenewalIntervalMs);
  heartbeat.unref?.();
  const ensureOwnership = () => {
    if (leaseLost) throw new LeaseOwnershipLostError();
  };

  try {
    const refreshed = await withRetry(() => refreshConnectionIfNeeded(channel, credentials));
    ensureOwnership();
    const snapshot = await withRetry(() => fetchAggregateSnapshot(provider, decryptSecret(refreshed.accessTokenEncrypted)));
    ensureOwnership();
    await db.createAudienceSnapshot({
      userId,
      channel: snapshot.provider,
      reach: snapshot.reach,
      impressions: snapshot.impressions,
      followers: snapshot.followers,
      engagement: snapshot.engagement,
      demographicVector: snapshot.demographicVector,
      observedAt: new Date(snapshot.observedAt),
      source: snapshot.source,
      createdAt: new Date(),
    });
    ensureOwnership();
    await db.updateConnectedChannel(channel.id, {
      accountName: snapshot.accountName,
      lastSyncedAt: new Date(),
      status: "connected",
      lastError: null,
    });
    return { provider, ok: true };
  } catch (error) {
    if (!leaseLost) await db.updateConnectedChannel(channel.id, { status: "error", lastError: errorMessage(error) }).catch(() => undefined);
    return { provider, ok: false, error: errorMessage(error) };
  } finally {
    clearInterval(heartbeat);
    await db.releaseSyncLease(userId, provider, leaseToken).catch(() => undefined);
  }
}

export async function syncUserChannels(userId: number, credentialsFor: (provider: Provider) => Promise<ProviderCredentials | undefined>) {
  const channels = await db.listConnectedChannels(userId);
  const results: SyncResult[] = [];
  for (const channel of channels) {
    results.push(await syncConnectedChannel(userId, channel.provider as Provider, await credentialsFor(channel.provider as Provider)));
  }
  return results;
}

export const syncPolicy = {
  maxAttempts: MAX_ATTEMPTS,
  minIntervalMs: MIN_SYNC_INTERVAL_MS,
  maxBackoffMs: MAX_BACKOFF_MS,
  leaseDurationMs: LEASE_DURATION_MS,
  leaseRenewalIntervalMs: LEASE_RENEWAL_INTERVAL_MS,
};
