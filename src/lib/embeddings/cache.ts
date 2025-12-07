import { kv } from "@vercel/kv";
import { createHash } from "node:crypto";

export type EmbeddingVector = number[];

function isKvConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL ||
      process.env.VERCEL_KV_REST_API_URL ||
      process.env.KV_URL,
  );
}

function buildCacheKey(text: string, modelName: string): string {
  const hash = createHash("sha256").update(text).digest("hex");
  return `embedding:${modelName}:${hash}`;
}

const inMemoryCache = new Map<string, EmbeddingVector>();

export async function getCachedEmbedding(
  text: string,
  modelName: string,
): Promise<EmbeddingVector | null> {
  const key = buildCacheKey(text, modelName);

  if (!isKvConfigured()) {
    const value = inMemoryCache.get(key);
    return value ?? null;
  }

  try {
    const value = (await kv.get<EmbeddingVector | null>(key)) ?? null;

    if (!value) {
      return null;
    }

    return value;
  } catch (error) {
    // If Vercel KV is misconfigured or temporarily unavailable, treat this
    // as a cache miss but log for observability. The embeddings pipeline
    // can still proceed without a functioning cache.
    //
    // Next.js surfaces server-side console output in the deployment logs,
    // which is appropriate for this low-volume diagnostic signal.
    console.error("Vercel KV getCachedEmbedding failed", error);

    return null;
  }
}

export async function setCachedEmbedding(
  text: string,
  modelName: string,
  embedding: EmbeddingVector,
): Promise<void> {
  const key = buildCacheKey(text, modelName);

  if (!isKvConfigured()) {
    inMemoryCache.set(key, embedding);
    return;
  }

  try {
    await kv.set(key, embedding);
  } catch (error) {
    // Cache writes are best-effort; failures should not break
    // embeddings generation.
    console.error("Vercel KV setCachedEmbedding failed", error);
  }
}

/**
* Cheap, side-effect-free KV availability check used by `/api/health`.
*
* This intentionally reflects configuration/intent ("KV is wired up for
* this deployment") rather than performing a live network probe on every
* health request, so the health surface does not flap due to transient
* connectivity issues.
*/
export function getKvAvailable(): boolean {
  return isKvConfigured();
}
