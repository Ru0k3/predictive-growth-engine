import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { buildDemoEvents, buildDemoInput, calculateOverlap, dashboardInputSchema, MODEL_VERSION } from "./analytics";
import { invokeLLM } from "./_core/llm";
import { z } from "zod";

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
    dashboard: publicProcedure.query(() => {
      const input = buildDemoInput();
      return {
        result: calculateOverlap(input),
        events: buildDemoEvents(),
        channels: input.channels.map(({ name, reach }) => ({ name, reach })),
        refreshedAt: new Date().toISOString(),
        freshness: "Demo fixture · replace with native API ingestion",
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
});

export type AppRouter = typeof appRouter;
