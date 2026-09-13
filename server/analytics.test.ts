import { describe, expect, it } from "vitest";
import { buildDemoInput, calculateOverlap, compressTimeSeries } from "./analytics";

describe("growth analytics engine", () => {
  it("returns a bounded, reproducible unique reach interval", () => {
    const input = buildDemoInput();
    const first = calculateOverlap(input);
    const second = calculateOverlap(input);

    expect(first).toEqual(second);
    expect(first.estimatedUniqueReach).toBeGreaterThanOrEqual(0);
    expect(first.interval.low).toBeLessThanOrEqual(first.estimatedUniqueReach);
    expect(first.interval.high).toBeGreaterThanOrEqual(first.estimatedUniqueReach);
    expect(first.interval.high).toBeLessThanOrEqual(input.channels.reduce((sum, channel) => sum + channel.reach, 0));
    expect(first.pairwise).toHaveLength(6);
  });

  it("calibrates similar demographics more strongly than orthogonal vectors", () => {
    const base = buildDemoInput();
    const similar = calculateOverlap({
      ...base,
      channels: [
        { name: "A", reach: 1000, demographics: [0.8, 0.2] },
        { name: "B", reach: 1000, demographics: [0.8, 0.2] },
      ],
    });
    const different = calculateOverlap({
      ...base,
      channels: [
        { name: "A", reach: 1000, demographics: [1, 0] },
        { name: "B", reach: 1000, demographics: [0, 1] },
      ],
    });

    expect(similar.pairwise[0]?.similarity).toBe(1);
    expect(different.pairwise[0]?.similarity).toBe(0);
    expect(similar.estimatedUniqueReach).toBeLessThan(different.estimatedUniqueReach);
  });

  it("compresses sharp changes into semantic events", () => {
    const events = compressTimeSeries([
      { t: 0, value: 100 },
      { t: 1, value: 80 },
      { t: 2, value: 55 },
      { t: 3, value: 60 },
    ], 0.1);

    expect(events.map((event) => event.type)).toEqual(["drop", "drop"]);
    expect(events[1]?.label).toContain("slope");
  });
});
