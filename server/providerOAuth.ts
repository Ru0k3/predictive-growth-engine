import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { createContext } from "./_core/context";
import * as db from "./db";
import { consumeProviderState, decryptSecret, encryptSecret, exchangeProviderCode, Provider, ProviderCredentials, refreshProviderToken } from "./providers";
import { ENV } from "./_core/env";

const STATE_COOKIE = "__Host-provider_oauth_state";
const PROVIDER_COOKIE = "__Host-provider_oauth_provider";
const ORIGIN_COOKIE = "__Host-provider_oauth_origin";
export function isSupportedProvider(value: string | undefined): value is Provider {
  return value === "youtube" || value === "instagram" || value === "tiktok";
}

function getQueryParam(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerProviderOAuthRoutes(app: Express) {
  app.get("/api/provider-oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const providerValue = cookies[PROVIDER_COOKIE];
    const provider = providerValue as Provider | undefined;
    if (!code || !state || !provider || !isSupportedProvider(providerValue) || state !== cookies[STATE_COOKIE]) {
      res.status(403).json({ error: "Invalid provider OAuth state." });
      return;
    }
    res.clearCookie(STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    res.clearCookie(PROVIDER_COOKIE, { path: "/", secure: true, sameSite: "none" });
    res.clearCookie(ORIGIN_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const context = await createContext({ req, res } as any);
      if (!context.user) {
        res.redirect("/?connection_error=sign_in_required");
        return;
      }
      const origin = cookies[ORIGIN_COOKIE];
      if (!origin) {
        res.redirect("/?connection_error=origin_missing");
        return;
      }
      const requestProtocol = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0].trim();
      const requestHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
      const requestOrigin = requestHost ? `${requestProtocol}://${requestHost}` : "";
      if (origin !== requestOrigin && !ENV.allowedAppOrigins.includes(origin)) {
        res.redirect("/?connection_error=origin_not_allowed");
        return;
      }
      if (!consumeProviderState(state, { userId: context.user.id, provider })) {
        res.status(403).json({ error: "Expired, replayed, or mismatched provider OAuth state." });
        return;
      }
      const redirectUri = `${origin}/api/provider-oauth/callback`;
      const configured = await db.getProviderSettings(context.user.id, provider);
      const credentials: ProviderCredentials | undefined = configured ? { clientId: decryptSecret(configured.clientIdEncrypted), clientSecret: decryptSecret(configured.clientSecretEncrypted), scopes: configured.scopes?.split(",").filter(Boolean) } : undefined;
      const token = await exchangeProviderCode(provider, code, redirectUri, credentials);
      const now = Date.now();
      await db.upsertConnectedChannel({
        userId: context.user.id,
        provider,
        externalAccountId: token.open_id ?? `${provider}:${context.user.id}`,
        accountName: `${provider[0]!.toUpperCase()}${provider.slice(1)} account`,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        accessTokenExpiresAt: token.expires_in ? new Date(now + token.expires_in * 1000) : null,
        refreshTokenExpiresAt: token.refresh_expires_in ? new Date(now + token.refresh_expires_in * 1000) : null,
        scopes: token.scope ?? null,
        lastSyncedAt: null,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      res.redirect("/?connection=success");
    } catch (error) {
      console.error("[Provider OAuth] callback failed", error);
      res.redirect("/?connection_error=provider_unavailable");
    }
  });
}

export async function refreshConnectionIfNeeded(channel: any, credentials?: ProviderCredentials) {
  if (!channel.accessTokenExpiresAt || channel.accessTokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) return channel;
  if (!channel.refreshTokenEncrypted) return channel;
  const token = await refreshProviderToken(channel.provider as Provider, decryptSecret(channel.refreshTokenEncrypted), credentials);
  await db.updateConnectedChannel(channel.id, {
    accessTokenEncrypted: encryptSecret(token.access_token),
    refreshTokenEncrypted: token.refresh_token ? encryptSecret(token.refresh_token) : channel.refreshTokenEncrypted,
    accessTokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : channel.accessTokenExpiresAt,
    refreshTokenExpiresAt: token.refresh_expires_in ? new Date(Date.now() + token.refresh_expires_in * 1000) : channel.refreshTokenExpiresAt,
  });
  return { ...channel, accessTokenEncrypted: encryptSecret(token.access_token), accessTokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : channel.accessTokenExpiresAt };
}
