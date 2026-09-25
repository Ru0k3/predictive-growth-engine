import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { decryptSecret, fetchAggregateSnapshot, Provider, ProviderCredentials } from "./providers";
import { refreshConnectionIfNeeded } from "./providerOAuth";

async function credentialsFor(userId: number, provider: Provider): Promise<ProviderCredentials | undefined> {
  const row = await db.getProviderSettings(userId, provider);
  return row ? { clientId: decryptSecret(row.clientIdEncrypted), clientSecret: decryptSecret(row.clientSecretEncrypted), scopes: row.scopes?.split(",").filter(Boolean) } : undefined;
}

export function registerScheduledRoutes(app: Express) {
  app.post("/api/scheduled/sync-metrics", async (req: Request, res: Response) => {
    try {
      const cronUser = await sdk.authenticateRequest(req);
      if (!cronUser.isCron || !cronUser.taskUid) return res.status(403).json({ error: "cron-only" });
      const user = await db.getUserByScheduleTaskUid(cronUser.taskUid);
      if (!user) return res.json({ ok: true, skipped: "orphan" });
      const channels = await db.listConnectedChannels(user.id);
      const results = [] as Array<{ provider: string; ok: boolean; error?: string }>;
      for (const channel of channels) {
        try {
          const full = await db.getConnectedChannel(user.id, channel.provider);
          if (!full) continue;
          const refreshed = await refreshConnectionIfNeeded(full, await credentialsFor(user.id, channel.provider as Provider));
          const snapshot = await fetchAggregateSnapshot(channel.provider as Provider, decryptSecret(refreshed.accessTokenEncrypted));
          await db.createAudienceSnapshot({ userId: user.id, channel: snapshot.provider, reach: snapshot.reach, impressions: snapshot.impressions, followers: snapshot.followers, engagement: snapshot.engagement, demographicVector: snapshot.demographicVector, observedAt: new Date(snapshot.observedAt), source: snapshot.source, createdAt: new Date() });
          await db.updateConnectedChannel(full.id, { accountName: snapshot.accountName, lastSyncedAt: new Date(), status: "connected", lastError: null });
          results.push({ provider: channel.provider, ok: true });
        } catch (error) {
          if (channel.id) await db.updateConnectedChannel(channel.id, { status: "error", lastError: String(error instanceof Error ? error.message : error).replace(/\s+/g, " ").slice(0, 512) }).catch(() => undefined);
          results.push({ provider: channel.provider, ok: false, error: String(error) });
        }
      }
      return res.json({ ok: true, syncedAt: new Date().toISOString(), results });
    } catch (error) {
      return res.status(500).json({ error: String(error), timestamp: new Date().toISOString() });
    }
  });
}
