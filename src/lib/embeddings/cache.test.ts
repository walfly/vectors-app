import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/kv", () => {
  const get = vi.fn();
  const set = vi.fn();

  return {
    kv: {
      get,
      set,
    },
  };
});

type CacheModule = typeof import("./cache");

async function loadCacheModule(): Promise<CacheModule> {
  const mod = await import("./cache");
  return mod as CacheModule;
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("embeddings cache - in-memory fallback", () => {
  it("stores and retrieves embeddings when KV is not configured", async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.VERCEL_KV_REST_API_URL;
    delete process.env.KV_URL;

    const { getCachedEmbedding, setCachedEmbedding, getKvAvailable } =
      await loadCacheModule();

    expect(getKvAvailable()).toBe(false);

    const text = "hello world";
    const modelName = "test-model";

    const miss = await getCachedEmbedding(text, modelName);
    expect(miss).toBeNull();

    const embedding = [1, 2, 3];

    await setCachedEmbedding(text, modelName, embedding);

    const hit = await getCachedEmbedding(text, modelName);
    expect(hit).toEqual(embedding);

    const { kv } = await import("@vercel/kv");
    const kvGetMock = kv.get as unknown as ReturnType<typeof vi.fn>;
    const kvSetMock = kv.set as unknown as ReturnType<typeof vi.fn>;

    expect(kvGetMock).not.toHaveBeenCalled();
    expect(kvSetMock).not.toHaveBeenCalled();
  });
});

describe("embeddings cache - Vercel KV", () => {
  it("delegates to Vercel KV when configuration is present", async () => {
    process.env.KV_REST_API_URL = "https://example.com/kv";

    const { getCachedEmbedding, setCachedEmbedding, getKvAvailable } =
      await loadCacheModule();

    expect(getKvAvailable()).toBe(true);

    const { kv } = await import("@vercel/kv");
    const kvGetMock = kv.get as unknown as ReturnType<typeof vi.fn>;
    const kvSetMock = kv.set as unknown as ReturnType<typeof vi.fn>;

    kvGetMock.mockResolvedValueOnce([1, 2, 3]);

    const text = "hello world";
    const modelName = "test-model";

    const hit = await getCachedEmbedding(text, modelName);
    expect(hit).toEqual([1, 2, 3]);

    await setCachedEmbedding(text, modelName, [4, 5, 6]);

    expect(kvGetMock).toHaveBeenCalledTimes(1);
    expect(kvSetMock).toHaveBeenCalledTimes(1);

    const usedKeyForGet = kvGetMock.mock.calls[0]?.[0] as string;
    const usedKeyForSet = kvSetMock.mock.calls[0]?.[0] as string;

    expect(usedKeyForGet.startsWith("embedding:test-model:")).toBe(true);
    expect(usedKeyForSet.startsWith("embedding:test-model:")).toBe(true);
  });
});
