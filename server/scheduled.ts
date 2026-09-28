import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { decryptSecret, Provider, ProviderCredentials } from "./providers";
import { syncUserChannels } from "./sync";

async function credentialsFor(userId: number, provider: Provider): Promise<ProviderCredentials | undefined> {
  const row = await db.getProviderSettings(userId, provider);
  return row ? { clientId: decryptSecret(row.clientIdEncrypted), clientSecret: decryptSecret(row.clientSecretEncrypted), scopes: row.scopes?.split(",").filter(Boolean) } : undefined;
}

export function registerScheduledRoutes(app: Express) {
  app.post("/api/scheduled/sync-metrics", async (req: Request, res: Response) => {
    try {
      const cronUser = await sdk.authenticateRequest(req);
      if (!cronUser.isCron || !cronUser.taskUid) return res.status(403).json({ error: "cron-only" });
      try {
        await db.cleanupExpiredCoordinationRecords(100);
      } catch (cleanupError) {
        console.warn("[Coordination cleanup] failed", cleanupError instanceof Error ? cleanupError.message : "unknown error");
      }
      const user = await db.getUserByScheduleTaskUid(cronUser.taskUid);
      if (!user) return res.json({ ok: true, skipped: "orphan" });
      const results = await syncUserChannels(user.id, (provider) => credentialsFor(user.id, provider));
      return res.json({ ok: true, syncedAt: new Date().toISOString(), results });
    } catch (error) {
      return res.status(500).json({ error: String(error), timestamp: new Date().toISOString() });
    }
  });
}
