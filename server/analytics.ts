import { z } from "zod";

export const MODEL_VERSION = "growth-engine-v1";

export const demographicVectorSchema = z.array(z.number().min(0)).min(1);

export const channelInputSchema = z.object({
  name: z.string().min(1),
  reach: z.number().int().nonnegative(),
  demographics: demographicVectorSchema,
});

export type ChannelInput = z.infer<typeof channelInputSchema>;

export const dashboardInputSchema = z.object({
  channels: z.array(channelInputSchema).min(2).max(6),
  coefficient: z.number().min(0).max(1),
  variance: z.number().min(0).max(1),
  simulations: z.number().int().min(100).max(5000).default(1000),
  seed: z.number().int().default(42),
});

export type DashboardInput = z.infer<typeof dashboardInputSchema>;

export type OverlapResult = {
  estimatedUniqueReach: number;
  interval: { low: number; high: number; confidence: number };
  pairwise: Array<{ a: string; b: string; overlap: number; similarity: number }>;
  assumptions: string[];
  modelVersion: string;
};

function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    magnitudeA += x * x;
    magnitudeB += y * y;
  }
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dot / Math.sqrt(magnitudeA * magnitudeB);
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? 0;
  const weight = index - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

export function calculateOverlap(input: DashboardInput): OverlapResult {
  const channels = input.channels;
  const totalReach = channels.reduce((sum, channel) => sum + channel.reach, 0);
  const pairs: OverlapResult["pairwise"] = [];

  for (let i = 0; i < channels.length; i += 1) {
    for (let j = i + 1; j < channels.length; j += 1) {
      const a = channels[i]!;
      const b = channels[j]!;
      const similarity = cosineSimilarity(a.demographics, b.demographics);
      const overlap = Math.min(a.reach, b.reach, a.reach * b.reach * input.coefficient * similarity / Math.max(totalReach, 1));
      pairs.push({ a: a.name, b: b.name, overlap, similarity });
    }
  }

  const random = mulberry32(input.seed);
  const simulations: number[] = [];
  for (let run = 0; run < input.simulations; run += 1) {
    const multiplier = 1 + (random() * 2 - 1) * input.variance;
    const simulatedOverlap = pairs.reduce((sum, pair) => sum + pair.overlap * multiplier, 0);
    simulations.push(Math.max(0, Math.min(totalReach, totalReach - simulatedOverlap)));
  }
  simulations.sort((a, b) => a - b);

  return {
    estimatedUniqueReach: Math.round(percentile([...simulations].sort((a, b) => a - b), 0.5)),
    interval: {
      low: Math.round(percentile(simulations, 0.025)),
      high: Math.round(percentile(simulations, 0.975)),
      confidence: 0.95,
    },
    pairwise: pairs.map((pair) => ({ ...pair, overlap: Math.round(pair.overlap * 10) / 10, similarity: Math.round(pair.similarity * 100) / 100 })),
    assumptions: [
      "Aggregate demographic similarity calibrates, but does not prove, audience duplication.",
      "Higher-order intersections use a bounded pairwise inclusion–exclusion approximation.",
      `Interval reflects ±${Math.round(input.variance * 100)}% coefficient variance across ${input.simulations.toLocaleString()} seeded simulations.`,
    ],
    modelVersion: MODEL_VERSION,
  };
}

export type TimeSeriesPoint = { t: number; value: number };
export type InflectionEvent = { type: "drop" | "spike" | "plateau"; position: number; magnitude: number; label: string };

export function compressTimeSeries(points: TimeSeriesPoint[], threshold = 0.08): InflectionEvent[] {
  if (points.length < 2) return [];
  const events: InflectionEvent[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]!;
    const current = points[i]!;
    const delta = current.value - previous.value;
    const slope = delta / Math.max(current.t - previous.t, 1);
    const normalized = Math.abs(delta) / Math.max(Math.abs(previous.value), 1);
    if (normalized >= threshold) {
      const type = delta < 0 ? "drop" : "spike";
      events.push({ type, position: current.t, magnitude: Math.round(Math.abs(delta) * 100) / 100, label: `${type === "drop" ? "Drop" : "Spike"} · slope ${slope.toFixed(2)}` });
    }
  }
  const average = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const isPlateau = points.length >= 3 && points.slice(-3).every((point) => Math.abs(point.value - average) / Math.max(Math.abs(average), 1) < threshold / 2);
  if (isPlateau) events.push({ type: "plateau", position: points.at(-1)!.t, magnitude: 0, label: "Plateau · stable attention" });
  return events.slice(0, 15);
}

export function buildDemoInput(): DashboardInput {
  return {
    channels: [
      { name: "YouTube", reach: 18200, demographics: [0.32, 0.26, 0.18, 0.14, 0.1] },
      { name: "Instagram", reach: 12700, demographics: [0.38, 0.28, 0.14, 0.12, 0.08] },
      { name: "TikTok", reach: 9800, demographics: [0.46, 0.24, 0.12, 0.1, 0.08] },
      { name: "Portfolio", reach: 4300, demographics: [0.22, 0.24, 0.2, 0.18, 0.16] },
    ],
    coefficient: 0.76,
    variance: 0.09,
    simulations: 1000,
    seed: 2026,
  };
}

export function buildDemoEvents(): InflectionEvent[] {
  return compressTimeSeries([
    { t: 0.06, value: 0.94 }, { t: 0.18, value: 0.91 }, { t: 0.31, value: 0.86 },
    { t: 0.43, value: 0.62 }, { t: 0.55, value: 0.58 }, { t: 0.67, value: 0.59 },
    { t: 0.79, value: 0.43 }, { t: 0.92, value: 0.4 },
  ], 0.12);
}
