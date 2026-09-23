import { describe, expect, it } from "vitest";
import { buildCsv } from "./reports";

describe("offline analytics reports", () => {
  it("emits a stable CSV header and preserves source values safely", () => {
    const csv = buildCsv([{ date: "2026-09-23T09:00:00.000Z", platform: "youtube", reach: 1200, impressions: 3000, followers: 450, engagement: 92, source: "YouTube Analytics" }]);
    expect(csv.split("\n")).toEqual([
      "date,platform,reach,impressions,followers,engagement,source",
      '2026-09-23T09:00:00.000Z,youtube,1200,3000,450,92,"YouTube Analytics"',
    ]);
  });
});
