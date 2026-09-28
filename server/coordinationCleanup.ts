import * as db from "./db";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(Math.floor(parsed), maximum));
}

export function getCoordinationCleanupConfig() {
  return {
    intervalMs: boundedInteger(process.env.COORDINATION_CLEANUP_INTERVAL_MS, DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS, MAX_INTERVAL_MS),
    batchSize: boundedInteger(process.env.COORDINATION_CLEANUP_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE),
  };
}

export async function runCoordinationCleanup() {
  const startedAt = Date.now();
  try {
    const { batchSize } = getCoordinationCleanupConfig();
    const result = await db.cleanupExpiredCoordinationRecords(batchSize);
    console.info("[Coordination cleanup] completed", { oauthStates: result.oauthStates, syncLeases: result.syncLeases, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.warn("[Coordination cleanup] failed", { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.name : "unknown" });
    return { oauthStates: 0, syncLeases: 0 };
  }
}

export function startCoordinationCleanupScheduler() {
  const { intervalMs } = getCoordinationCleanupConfig();
  void runCoordinationCleanup();
  const timer = setInterval(() => { void runCoordinationCleanup(); }, intervalMs);
  timer.unref?.();
  return timer;
}
