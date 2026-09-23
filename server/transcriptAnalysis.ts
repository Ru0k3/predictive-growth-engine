export type TranscriptAnalysis = {
  transcript: string;
  topics: string[];
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  sentimentScore: number;
  summary: string;
};

export function normalizeTranscriptAnalysis(raw: string): TranscriptAnalysis {
  try {
    const value = JSON.parse(raw) as Partial<TranscriptAnalysis>;
    const sentiment = value.sentiment === "positive" || value.sentiment === "negative" || value.sentiment === "mixed" ? value.sentiment : "neutral";
    return {
      transcript: typeof value.transcript === "string" ? value.transcript : raw,
      topics: Array.isArray(value.topics) ? value.topics.filter((topic): topic is string => typeof topic === "string").slice(0, 8) : [],
      sentiment,
      sentimentScore: Math.max(-1, Math.min(1, typeof value.sentimentScore === "number" ? value.sentimentScore : 0)),
      summary: typeof value.summary === "string" ? value.summary : "",
    };
  } catch {
    return { transcript: raw, topics: [], sentiment: "neutral", sentimentScore: 0, summary: "" };
  }
}
