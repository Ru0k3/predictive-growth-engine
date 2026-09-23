import { describe, expect, it } from "vitest";
import { normalizeTranscriptAnalysis } from "./transcriptAnalysis";

describe("transcript analysis normalization", () => {
  it("keeps structured topics and clamps sentiment scores", () => {
    const result = normalizeTranscriptAnalysis(JSON.stringify({ transcript: "hello", topics: ["launch", 3, "audience"], sentiment: "positive", sentimentScore: 2, summary: "A launch update." }));
    expect(result).toEqual({ transcript: "hello", topics: ["launch", "audience"], sentiment: "positive", sentimentScore: 1, summary: "A launch update." });
  });

  it("falls back safely when the model returns plain text", () => {
    expect(normalizeTranscriptAnalysis("plain transcript")).toMatchObject({ transcript: "plain transcript", topics: [], sentiment: "neutral", sentimentScore: 0 });
  });
});
