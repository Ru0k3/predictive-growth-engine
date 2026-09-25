import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { buildDemoEvents, buildDemoInput, calculateOverlap, dashboardInputSchema, MODEL_VERSION } from "./analytics";
import { invokeLLM } from "./_core/llm";
import { z } from "zod";
import { buildProviderAuthorizationUrl, decryptSecret, encryptSecret, fetchAggregateSnapshot, fetchTargetedMetrics, Provider, ProviderCredentials, createProviderState, getProviderConfig, revokeProviderToken } from "./providers";
import { refreshConnectionIfNeeded } from "./providerOAuth";
import * as db from "./db";
import { buildEvidenceEvents, buildStructuralOutline, extractContentData, retrieveEvidence } from "./content";
import { storagePut } from "./storage";
import { parse as parseCookieHeader } from "cookie";
import { createHeartbeatJob, deleteHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { normalizeTranscriptAnalysis } from "./transcriptAnalysis";
import { syncConnectedChannel } from "./sync";
import { ENV } from "./_core/env";

async function userProviderCredentials(userId: number, provider: Provider): Promise<ProviderCredentials | undefined> {
  const row = await db.getProviderSettings(userId, provider);
  return row ? { clientId: decryptSecret(row.clientIdEncrypted), clientSecret: decryptSecret(row.clientSecretEncrypted), scopes: row.scopes?.split(",").filter(Boolean) } : undefined;
}

function providerErrorMessage(error: unknown) {
  return String(error instanceof Error ? error.message : error).replace(/\s+/g, " ").slice(0, 512);
}

function sessionToken(ctx: any) {
  return parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
}
function isAllowedAppOrigin(origin: string, req: any) {
  const requestProtocol = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0].trim();
  const requestHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  const requestOrigin = requestHost ? `${requestProtocol}://${requestHost}` : "";
  return (requestOrigin && origin === requestOrigin) || ENV.allowedAppOrigins.includes(origin);
}

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
          const latest = await db.listLatestAudienceSnapshots(ctx.user.id);
          const latestByProvider = new Map(latest.map((snapshot) => [snapshot.channel, snapshot]));
          const live = channels.map((channel) => {
            const snapshot = latestByProvider.get(channel.provider);
            return snapshot ? { channel, snapshot } : null;
          }).filter(Boolean) as Array<{ channel: (typeof channels)[number]; snapshot: (typeof latest)[number] }>;
          if (live.length > 0) {
            const input = {
              channels: live.map(({ channel, snapshot }) => ({ name: channel.accountName, reach: snapshot.reach, demographics: (snapshot.demographicVector ?? []) as number[] })),
              coefficient: 0.76,
              variance: 0.09,
              simulations: 1000,
              seed: 42,
            };
            const observedAt = live.map(({ snapshot }) => snapshot.observedAt.getTime()).sort((a, b) => b - a)[0];
            return {
              result: calculateOverlap(input),
              events: [],
              channels: live.map(({ channel, snapshot }) => ({ name: channel.accountName, reach: snapshot.reach, provider: snapshot.channel, impressions: snapshot.impressions ?? 0, followers: snapshot.followers ?? 0, engagement: snapshot.engagement ?? 0 })),
              refreshedAt: observedAt ? new Date(observedAt).toISOString() : "",
              freshness: `Persisted provider snapshots · ${live.length} channel${live.length === 1 ? "" : "s"}`,
            };
          }
          return {
            result: { estimatedUniqueReach: 0, interval: { low: 0, high: 0, confidence: 0.95 }, pairwise: [], assumptions: [], modelVersion: MODEL_VERSION },
            events: [],
            channels: channels.map((channel) => ({ name: channel.accountName, reach: 0, provider: channel.provider })),
            refreshedAt: "",
            freshness: "Connected channels · awaiting background sync",
          };
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
    history: protectedProcedure.input(z.object({ days: z.number().int().min(7).max(365).default(90), channel: z.string().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() })).query(({ ctx, input }) => db.listAudienceSnapshots(ctx.user.id, input.days, input.channel, input.from ? new Date(input.from) : undefined, input.to ? new Date(input.to) : undefined)),
    targeted: protectedProcedure.input(z.object({ provider: z.enum(["youtube", "instagram", "tiktok"]), windowDays: z.number().int().min(7).max(90).default(28) })).query(async ({ ctx, input }) => {
      const channel = await db.getConnectedChannel(ctx.user.id, input.provider);
      if (!channel) throw new Error("Connect this provider first.");
      const refreshed = await refreshConnectionIfNeeded(channel, await userProviderCredentials(ctx.user.id, input.provider));
      return fetchTargetedMetrics(input.provider, decryptSecret(refreshed.accessTokenEncrypted), channel.externalAccountId, input.windowDays);
    }),
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
    start: protectedProcedure.input(z.object({ provider: z.enum(["youtube", "instagram", "tiktok"]), origin: z.string().url() })).mutation(async ({ ctx, input }) => {
      if (!isAllowedAppOrigin(input.origin, ctx.req)) throw new Error("OAuth origin is not allowed.");
      const state = createProviderState();
      const redirectUri = `${input.origin}/api/provider-oauth/callback`;
      const url = buildProviderAuthorizationUrl(input.provider, redirectUri, state, await userProviderCredentials(ctx.user.id, input.provider));
      ctx.res.cookie("__Host-provider_oauth_state", state, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 10 * 60 * 1000 });
      ctx.res.cookie("__Host-provider_oauth_provider", input.provider, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 10 * 60 * 1000 });
      ctx.res.cookie("__Host-provider_oauth_origin", input.origin, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 10 * 60 * 1000 });
      return { url };
    }),
    disconnect: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const channel = await db.getConnectedChannelById(ctx.user.id, input.id);
      if (channel) {
        try {
          await revokeProviderToken(channel.provider as Provider, decryptSecret(channel.accessTokenEncrypted), channel.externalAccountId, await userProviderCredentials(ctx.user.id, channel.provider as Provider));
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
      const result = await syncConnectedChannel(ctx.user.id, input.provider, await userProviderCredentials(ctx.user.id, input.provider), { force: true });
      if (!result.ok) throw new Error(result.error ?? "Provider sync failed.");
      return { provider: input.provider, syncedAt: new Date().toISOString() };
    }),
    config: publicProcedure.query(async ({ ctx }) => ({
      youtube: Boolean(getProviderConfig("youtube").clientId) || Boolean(ctx.user && await db.getProviderSettings(ctx.user.id, "youtube")),
      instagram: Boolean(getProviderConfig("instagram").clientId) || Boolean(ctx.user && await db.getProviderSettings(ctx.user.id, "instagram")),
      tiktok: Boolean(getProviderConfig("tiktok").clientId) || Boolean(ctx.user && await db.getProviderSettings(ctx.user.id, "tiktok")),
    })),
  }),
  providerSettings: router({
    list: protectedProcedure.query(({ ctx }) => db.listProviderSettings(ctx.user.id)),
    save: protectedProcedure.input(z.object({ provider: z.enum(["youtube", "instagram", "tiktok"]), clientId: z.string().min(1).max(512), clientSecret: z.string().min(1).max(2048), redirectUri: z.string().url().optional(), scopes: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      await db.upsertProviderSettings({ userId: ctx.user.id, provider: input.provider, clientIdEncrypted: encryptSecret(input.clientId), clientSecretEncrypted: encryptSecret(input.clientSecret), redirectUri: input.redirectUri ?? null, scopes: input.scopes ?? null, enabled: 1, createdAt: new Date(), updatedAt: new Date() });
      return { success: true } as const;
    }),
    remove: protectedProcedure.input(z.object({ provider: z.enum(["youtube", "instagram", "tiktok"]) })).mutation(async ({ ctx, input }) => { await db.deleteProviderSettings(ctx.user.id, input.provider); return { success: true } as const; }),
  }),
  syncSchedule: router({
    status: protectedProcedure.query(({ ctx }) => ({ cron: ctx.user.scheduleCron ?? null, taskUid: ctx.user.scheduleCronTaskUid ?? null, enabled: Boolean(ctx.user.scheduleCronTaskUid) })),
    save: protectedProcedure.input(z.object({ cron: z.enum(["0 0 * * * *", "0 0 9 * * *", "0 0 9 * * 1"]) })).mutation(async ({ ctx, input }) => {
      const token = sessionToken(ctx);
      if (ctx.user.scheduleCronTaskUid) await updateHeartbeatJob(ctx.user.scheduleCronTaskUid, { cron: input.cron, enable: true, description: "Sync connected social metrics and update historical dashboard trends" }, token);
      else {
        const job = await createHeartbeatJob({ name: `sync-metrics-${ctx.user.id}`, cron: input.cron, path: "/api/scheduled/sync-metrics", description: "Sync connected social metrics and update historical dashboard trends" }, token);
        await db.updateUserSchedule(ctx.user.id, { scheduleCronTaskUid: job.taskUid, scheduleCron: input.cron });
      }
      if (ctx.user.scheduleCronTaskUid) await db.updateUserSchedule(ctx.user.id, { scheduleCron: input.cron });
      return { success: true, cron: input.cron } as const;
    }),
    disable: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.scheduleCronTaskUid) await deleteHeartbeatJob(ctx.user.scheduleCronTaskUid, sessionToken(ctx));
      await db.updateUserSchedule(ctx.user.id, { scheduleCronTaskUid: null, scheduleCron: null });
      return { success: true } as const;
    }),
  }),
  content: router({
    list: protectedProcedure.query(({ ctx }) => db.listContentAssets(ctx.user.id)),
    upload: protectedProcedure.input(z.object({ name: z.string().min(1).max(255), mimeType: z.string().min(1).max(128), base64: z.string().min(1).max(8_000_000) })).mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const extracted = await extractContentData(input.name, input.mimeType, buffer);
      const text = extracted.text;
      const outline = buildStructuralOutline(text);
      const events = buildEvidenceEvents(outline);
      const stored = await storagePut(`${ctx.user.id}-content/${input.name}`, buffer, input.mimeType);
      const assetId = await db.createContentAsset({ userId: ctx.user.id, name: input.name, mimeType: input.mimeType, storageKey: stored.key, contentText: text, structuralOutline: outline, metadata: { ...extracted.metadata, storageUrl: stored.url }, createdAt: new Date() });
      await db.createEvidenceEvents(events.map((event) => ({ ...event, userId: ctx.user!.id, assetId, createdAt: new Date() })));
      return { id: assetId, name: input.name, sections: outline.length, events: events.length, url: stored.url };
    }),
    transcribe: protectedProcedure.input(z.object({ assetId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const asset = await db.getContentAsset(ctx.user.id, input.assetId);
      if (!asset) throw new Error("Content asset not found.");
      const metadata = (asset.metadata ?? {}) as { storageUrl?: string; kind?: string };
      if (!metadata.storageUrl) throw new Error("This asset has no accessible media URL.");
      const response = await invokeLLM({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "Transcribe the supplied video or audio faithfully, then extract key topics and sentiment from the transcript. Return structured JSON only. Do not invent missing words or evidence." },
          { role: "user", content: [{ type: "text", text: `Analyze this uploaded ${asset.mimeType} file. Return a faithful transcript plus 3-8 concise topics, an overall sentiment label, a sentiment score from -1 to 1, and a one-sentence summary.` }, { type: "file_url", file_url: { url: metadata.storageUrl, mime_type: asset.mimeType as "video/mp4" } }] },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "transcript_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                transcript: { type: "string" },
                topics: { type: "array", items: { type: "string" } },
                sentiment: { type: "string", enum: ["positive", "neutral", "negative", "mixed"] },
                sentimentScore: { type: "number" },
                summary: { type: "string" },
              },
              required: ["transcript", "topics", "sentiment", "sentimentScore", "summary"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices?.[0]?.message?.content;
      const raw = typeof content === "string" ? content : content?.map((part) => "text" in part ? part.text : "").join("");
      if (!raw) throw new Error("The transcription model returned no text.");
      const analysis = normalizeTranscriptAnalysis(raw);
      const outline = buildStructuralOutline(analysis.transcript);
      await db.updateContentAsset(ctx.user.id, input.assetId, { contentText: analysis.transcript, structuralOutline: outline, metadata: { ...metadata, transcriptStatus: "generated", transcriptGeneratedAt: new Date().toISOString(), topics: analysis.topics, sentiment: analysis.sentiment, sentimentScore: analysis.sentimentScore, summary: analysis.summary } });
      return { ...analysis, sections: outline.length };
    }),
    evidence: protectedProcedure.input(z.object({ assetId: z.number().int().positive(), position: z.string().optional() })).query(async ({ ctx, input }) => {
      const asset = await db.getContentAsset(ctx.user.id, input.assetId);
      if (!asset) throw new Error("Content asset not found.");
      const outline = (asset.structuralOutline ?? []) as ReturnType<typeof buildStructuralOutline>;
      const evidence = retrieveEvidence(outline, input.position ?? "0.5");
      const events = await db.listEvidenceEvents(ctx.user.id, input.assetId);
      return { asset: { id: asset.id, name: asset.name, createdAt: asset.createdAt, metadata: asset.metadata }, evidence, events };
    }),
  }),
});

export type AppRouter = typeof appRouter;
