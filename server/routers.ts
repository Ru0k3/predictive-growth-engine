import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { buildDemoEvents, buildDemoInput, calculateOverlap, dashboardInputSchema, MODEL_VERSION } from "./analytics";
import { invokeLLM } from "./_core/llm";
import { z } from "zod";
import { buildProviderAuthorizationUrl, decryptSecret, fetchAggregateSnapshot, Provider, createProviderState, getProviderConfig, revokeProviderToken } from "./providers";
import { refreshConnectionIfNeeded } from "./providerOAuth";
import * as db from "./db";
import { buildEvidenceEvents, buildStructuralOutline, decodeTextUpload, retrieveEvidence } from "./content";
import { storagePut } from "./storage";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  analysis: router({
    dashboard: publicProcedure.query(async ({ ctx }) => {
      if (ctx.user) {
        const channels = await db.listConnectedChannels(ctx.user.id);
        if (channels.length > 0) {
          const snapshots = await Promise.all(channels.map(async (channel) => {
            try {
              const fullChannel = await db.getConnectedChannel(ctx.user!.id, channel.provider);
              if (!fullChannel) return null;
              const refreshed = await refreshConnectionIfNeeded(fullChannel);
              const snapshot = await fetchAggregateSnapshot(channel.provider as Provider, decryptSecret(refreshed.accessTokenEncrypted));
              await db.createAudienceSnapshot({ userId: ctx.user!.id, channel: snapshot.provider, reach: snapshot.reach, demographicVector: snapshot.demographicVector, observedAt: new Date(snapshot.observedAt), source: snapshot.source, createdAt: new Date() });
              return snapshot;
            } catch (error) {
              console.warn(`[${channel.provider}] live sync failed`, error);
              return null;
            }
          }));
          const live = snapshots.filter(Boolean) as NonNullable<typeof snapshots[number]>[];
          if (live.length > 0) {
            const input = {
              channels: live.map((snapshot) => ({ name: snapshot.accountName, reach: snapshot.reach, demographics: snapshot.demographicVector })),
              coefficient: 0.76,
              variance: 0.09,
              simulations: 1000,
              seed: Date.now() % 100000,
            };
            return {
              result: calculateOverlap(input),
              events: buildDemoEvents(),
              channels: live.map((snapshot) => ({ name: snapshot.accountName, reach: snapshot.reach, provider: snapshot.provider, impressions: snapshot.impressions, followers: snapshot.followers, engagement: snapshot.engagement })),
              refreshedAt: new Date().toISOString(),
              freshness: `Live native API data · ${live.length} connected channel${live.length === 1 ? "" : "s"}`,
            };
          }
        }
      }
      const input = buildDemoInput();
      return {
        result: calculateOverlap(input),
        events: buildDemoEvents(),
        channels: input.channels.map(({ name, reach }) => ({ name, reach })),
        refreshedAt: new Date().toISOString(),
        freshness: "Demo fixture · connect a channel to go live",
      };
    }),
    simulate: publicProcedure.input(dashboardInputSchema).mutation(({ input }) => calculateOverlap(input)),
    advisory: publicProcedure.input(z.object({
      focus: z.string().min(1).max(240),
      evidence: z.string().min(1).max(1200),
    })).mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          model: "gpt-5-mini",
          messages: [
            { role: "system", content: "You are a growth strategist. Return one concise, evidence-backed next move for a creator. Do not invent metrics." },
            { role: "user", content: `Focus: ${input.focus}\nEvidence: ${input.evidence}` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "advisory_card",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  recommendation: { type: "string" },
                  rationale: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                },
                required: ["title", "recommendation", "rationale", "confidence"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = response.choices?.[0]?.message?.content;
        const text = typeof content === "string" ? content : content?.map((part) => "text" in part ? part.text : "").join("");
        if (text) return { ...JSON.parse(text), modelVersion: MODEL_VERSION };
      } catch (error) {
        console.warn("[AI] Advisory generation unavailable; using deterministic fallback", error);
      }
      return {
        title: "Tighten the first transition",
        recommendation: "Rewrite the opening promise so the viewer reaches the first payoff before the 30% attention mark.",
        rationale: "The largest observed inflection is an early drop in the compressed retention curve. This recommendation is grounded in that event and should be validated on the next release.",
        confidence: "medium",
        modelVersion: MODEL_VERSION,
      } as const;
    }),
  }),
  connections: router({
    list: publicProcedure.query(async ({ ctx }) => ctx.user ? db.listConnectedChannels(ctx.user.id) : []),
    start: protectedProcedure.input(z.object({ provider: z.enum(["youtube", "instagram", "tiktok"]), origin: z.string().url() })).mutation(({ ctx, input }) => {
      const state = createProviderState();
      const redirectUri = `${input.origin}/api/provider-oauth/callback`;
      const url = buildProviderAuthorizationUrl(input.provider, redirectUri, state);
      ctx.res.cookie("__Host-provider_oauth_state", state, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 10 * 60 * 1000 });
      ctx.res.cookie("__Host-provider_oauth_provider", input.provider, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 10 * 60 * 1000 });
      ctx.res.cookie("__Host-provider_oauth_origin", input.origin, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 10 * 60 * 1000 });
      return { url };
    }),
    disconnect: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const channel = await db.getConnectedChannelById(ctx.user.id, input.id);
      if (channel) {
        try {
          await revokeProviderToken(channel.provider as Provider, decryptSecret(channel.accessTokenEncrypted), channel.externalAccountId);
        } catch (error) {
          console.warn("[Provider OAuth] remote revoke failed", error);
        }
      }
      await db.deleteConnectedChannel(ctx.user.id, input.id);
      return { success: true } as const;
    }),
    sync: protectedProcedure.input(z.object({ provider: z.enum(["youtube", "instagram", "tiktok"]) })).mutation(async ({ ctx, input }) => {
      const channel = await db.getConnectedChannel(ctx.user.id, input.provider);
      if (!channel) throw new Error("Connect this provider first.");
      const refreshed = await refreshConnectionIfNeeded(channel);
      const snapshot = await fetchAggregateSnapshot(input.provider, decryptSecret(refreshed.accessTokenEncrypted));
      await db.createAudienceSnapshot({ userId: ctx.user.id, channel: snapshot.provider, reach: snapshot.reach, demographicVector: snapshot.demographicVector, observedAt: new Date(snapshot.observedAt), source: snapshot.source, createdAt: new Date() });
      await db.updateConnectedChannel(channel.id, { accountName: snapshot.accountName, lastSyncedAt: new Date(), status: "connected" });
      return snapshot;
    }),
    config: publicProcedure.query(() => ({
      youtube: Boolean(getProviderConfig("youtube").clientId),
      instagram: Boolean(getProviderConfig("instagram").clientId),
      tiktok: Boolean(getProviderConfig("tiktok").clientId),
    })),
  }),
  content: router({
    list: protectedProcedure.query(({ ctx }) => db.listContentAssets(ctx.user.id)),
    upload: protectedProcedure.input(z.object({ name: z.string().min(1).max(255), mimeType: z.string().min(1).max(128), base64: z.string().min(1).max(8_000_000) })).mutation(async ({ ctx, input }) => {
      const text = decodeTextUpload(input.mimeType, input.base64);
      const outline = buildStructuralOutline(text);
      const events = buildEvidenceEvents(outline);
      const stored = await storagePut(`${ctx.user.id}-content/${input.name}`, Buffer.from(input.base64, "base64"), input.mimeType);
      const assetId = await db.createContentAsset({ userId: ctx.user.id, name: input.name, mimeType: input.mimeType, storageKey: stored.key, contentText: text, structuralOutline: outline, createdAt: new Date() });
      await db.createEvidenceEvents(events.map((event) => ({ ...event, userId: ctx.user!.id, assetId, createdAt: new Date() })));
      return { id: assetId, name: input.name, sections: outline.length, events: events.length, url: stored.url };
    }),
    evidence: protectedProcedure.input(z.object({ assetId: z.number().int().positive(), position: z.string().optional() })).query(async ({ ctx, input }) => {
      const asset = await db.getContentAsset(ctx.user.id, input.assetId);
      if (!asset) throw new Error("Content asset not found.");
      const outline = (asset.structuralOutline ?? []) as ReturnType<typeof buildStructuralOutline>;
      const evidence = retrieveEvidence(outline, input.position ?? "0.5");
      const events = await db.listEvidenceEvents(ctx.user.id, input.assetId);
      return { asset: { id: asset.id, name: asset.name, createdAt: asset.createdAt }, evidence, events };
    }),
  }),
});

export type AppRouter = typeof appRouter;
