import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("analysis procedures", () => {
  it("returns a populated, privacy-first dashboard snapshot", async () => {
    const caller = appRouter.createCaller(createContext());
    const snapshot = await caller.analysis.dashboard();

    expect(snapshot.result.modelVersion).toBe("growth-engine-v1");
    expect(snapshot.result.estimatedUniqueReach).toBeGreaterThan(0);
    expect(snapshot.channels).toHaveLength(4);
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(snapshot.freshness).toContain("Demo fixture");
  });

  it("accepts a custom seeded simulation payload", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.analysis.simulate({
      channels: [
        { name: "A", reach: 1000, demographics: [0.9, 0.1] },
        { name: "B", reach: 900, demographics: [0.8, 0.2] },
      ],
      coefficient: 0.7,
      variance: 0.05,
      simulations: 250,
      seed: 7,
    });

    expect(result.interval.confidence).toBe(0.95);
    expect(result.interval.low).toBeLessThanOrEqual(result.interval.high);
    expect(result.assumptions).toHaveLength(3);
  });
});
