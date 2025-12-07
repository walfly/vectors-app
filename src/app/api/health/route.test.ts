import { describe, expect, it, vi } from "vitest";

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(),
}));

type TestGetHandler = (request?: unknown) => Promise<Response>;

async function loadHealthGet(): Promise<TestGetHandler> {
  const mod = await import("./route");
  return (mod as unknown as { GET: TestGetHandler }).GET;
}

async function loadWarmGet(): Promise<TestGetHandler> {
  const mod = await import("../warm/route");
  return (mod as unknown as { GET: TestGetHandler }).GET;
}

describe("GET /api/health - base status", () => {
  it("returns 'degraded' when the embeddings model has not been initialized", async () => {
    vi.resetModules();

    process.env.KV_REST_API_URL = "https://example.com/kv";

    const GET = await loadHealthGet();

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      status: "degraded",
      modelLoaded: false,
      initializing: false,
      modelName: "Xenova/all-MiniLM-L6-v2",
      kvAvailable: true,
    });

    delete process.env.KV_REST_API_URL;
  });
});

describe("GET /api/health - interaction with /api/warm", () => {
  it("reports 'initializing: true' while the model is warming up", async () => {
    vi.resetModules();

    process.env.KV_REST_API_URL = "https://example.com/kv";

    const transformers = await import("@huggingface/transformers");
    const pipelineMock = transformers
      .pipeline as unknown as ReturnType<typeof vi.fn>;

    const embeddingsFn = vi.fn(async () => ({
      tolist: () => [],
    }));

    let resolvePipelineInit: (() => void) | undefined;

    pipelineMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePipelineInit = () => resolve(embeddingsFn);
        }),
    );

    const warmGET = await loadWarmGet();

    // Start warm-up but intentionally do not await completion yet so
    // the embeddings pipeline remains in an initializing state.
    const warmPromise = warmGET();

    const GET = await loadHealthGet();

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      status: "degraded",
      modelLoaded: false,
      initializing: true,
      modelName: "Xenova/all-MiniLM-L6-v2",
      kvAvailable: true,
    });

    // Complete initialization to avoid leaving a hanging promise.
    resolvePipelineInit?.();

    const warmResponse = await warmPromise;
    const warmJson = await warmResponse.json();

    expect(warmResponse.status).toBe(200);
    expect(warmJson).toEqual({
      warmed: true,
      modelName: "Xenova/all-MiniLM-L6-v2",
      status: "ready",
    });

    delete process.env.KV_REST_API_URL;
  });

  it("returns 'ok' once the embeddings model has been warmed", async () => {
    vi.resetModules();

    const transformers = await import("@huggingface/transformers");
    const pipelineMock = transformers
      .pipeline as unknown as ReturnType<typeof vi.fn>;

    const embeddingsFn = vi.fn(async () => ({
      // The warm endpoint only needs the pipeline to resolve successfully;
      // the actual embedding output is not used.
      tolist: () => [],
    }));

    pipelineMock.mockResolvedValueOnce(embeddingsFn);

    const warmGET = await loadWarmGet();

    const warmResponse = await warmGET();
    const warmJson = await warmResponse.json();

    expect(warmResponse.status).toBe(200);
    expect(warmJson).toEqual({
      warmed: true,
      modelName: "Xenova/all-MiniLM-L6-v2",
      status: "ready",
    });

    const GET = await loadHealthGet();

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("ok");
    expect(json.modelLoaded).toBe(true);
    expect(json.modelName).toBe("Xenova/all-MiniLM-L6-v2");
  });

  it("returns 'error' when model initialization fails", async () => {
    vi.resetModules();

    const transformers = await import("@huggingface/transformers");
    const pipelineMock = transformers
      .pipeline as unknown as ReturnType<typeof vi.fn>;

    pipelineMock.mockRejectedValueOnce(new Error("Failed to load model"));

    const warmGET = await loadWarmGet();

    const warmResponse = await warmGET();
    const warmJson = await warmResponse.json();

    expect(warmResponse.status).toBe(500);
    expect(warmJson.warmed).toBe(false);
    expect(warmJson.status).toBe("error");
    expect(warmJson.error).toContain("Failed to load model");

    const GET = await loadHealthGet();

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("error");
    expect(json.modelLoaded).toBe(false);
    expect(json.modelName).toBe("Xenova/all-MiniLM-L6-v2");
  });
});
