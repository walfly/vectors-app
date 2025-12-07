import { describe, expect, it, vi } from "vitest";

vi.mock("@xenova/transformers", () => ({
  pipeline: vi.fn(),
}));

type TestPostHandler = (request: {
  json: () => Promise<unknown>;
}) => Promise<Response>;

async function loadPost(): Promise<TestPostHandler> {
  const mod = await import("./route");
  return (mod as unknown as { POST: TestPostHandler }).POST;
}

function createRequest(body: unknown) {
  return {
    json: async () => body,
  };
}

function createRejectingRequest(error: Error) {
  return {
    json: async () => {
      throw error;
    },
  };
}

describe("POST /api/embeddings - request validation", () => {
  it("returns 400 when the JSON body is not an object", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest(null));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: "Invalid request body: expected a JSON object with an 'inputs' array.",
    });
  });

  it("returns 400 when 'inputs' is missing or not an array", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({}));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: "Invalid request body: 'inputs' must be an array of strings.",
    });
  });

  it("returns 400 when 'inputs' is empty", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({ inputs: [] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: "Invalid request body: 'inputs' array must not be empty.",
    });
  });

  it("returns 400 when any input is not a string", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({ inputs: ["hello", 123, "world"] }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: "Invalid request body: all 'inputs' entries must be strings.",
    });
  });

  it("returns 400 when all inputs are empty after trimming", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({ inputs: ["   ", "\n\t  "] }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: "Invalid request body: at least one input string must be non-empty.",
    });
  });

  it("returns 400 when inputs exceed the maximum count", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const inputs = Array.from({ length: 65 }, () => "hello");

    const response = await POST(createRequest({ inputs }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("must not contain more than 64 items");
  });

  it("returns 400 when any input exceeds the maximum length", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const longString = "a".repeat(1025);

    const response = await POST(createRequest({ inputs: [longString] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain(
      "each input string must be at most 1024 characters long",
    );
  });

  it("returns 400 when JSON parsing fails", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRejectingRequest(new Error("Unexpected token")),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid JSON body.");
    expect(json.details).toContain("Unexpected token");
  });
});

describe("POST /api/embeddings - embeddings pipeline integration", () => {
  it("returns 200 with embeddings when the model outputs via tolist()", async () => {
    vi.resetModules();

    const transformers = await import("@xenova/transformers");
    const pipelineMock = transformers.pipeline as unknown as ReturnType<
      typeof vi.fn
    >;

    const embeddingsFn = vi.fn(async (inputs: string[]) => ({
      tolist: () => inputs.map((_, index) => [index, index + 1, index + 2]),
    }));

    pipelineMock.mockResolvedValueOnce(embeddingsFn);

    const POST = await loadPost();

    // First request should surface a cold-start 503 while the model initializes.
    const initializingResponse = await POST(
      createRequest({ inputs: ["foo", "bar"] }),
    );
    const initializingJson = await initializingResponse.json();

    expect(initializingResponse.status).toBe(503);
    expect(initializingJson).toEqual({
      error: "Embeddings model is still loading. Please try again shortly.",
      status: "initializing",
      model: "Xenova/all-MiniLM-L6-v2",
    });

    // Once the pipeline promise resolves, subsequent requests should succeed.
    await Promise.resolve();

    const response = await POST(
      createRequest({ inputs: ["foo", "bar"] }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.model).toBe("Xenova/all-MiniLM-L6-v2");
    expect(json.embeddings).toEqual([
      [0, 1, 2],
      [1, 2, 3],
    ]);
    expect(json.dimensions).toBe(3);
    expect(embeddingsFn).toHaveBeenCalledWith(["foo", "bar"], {
      pooling: "mean",
      normalize: true,
    });
  });

  it("returns 500 when tolist() returns an empty array", async () => {
    vi.resetModules();

    const transformers = await import("@xenova/transformers");
    const pipelineMock = transformers.pipeline as unknown as ReturnType<
      typeof vi.fn
    >;

    const embeddingsFn = vi.fn(async () => ({
      tolist: () => [],
    }));

    pipelineMock.mockResolvedValueOnce(embeddingsFn);

    const POST = await loadPost();

    // First request returns a cold-start 503.
    const initializingResponse = await POST(createRequest({ inputs: ["foo"] }));
    expect(initializingResponse.status).toBe(503);

    await Promise.resolve();

    // Once initialized, an empty list result is treated as a model error.
    const response = await POST(createRequest({ inputs: ["foo"] }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({
      error: "Embeddings model returned empty or invalid list output.",
    });
  });

  it("returns 200 with embeddings when the model outputs dims/data", async () => {
    vi.resetModules();

    const transformers = await import("@xenova/transformers");
    const pipelineMock = transformers.pipeline as unknown as ReturnType<
      typeof vi.fn
    >;

    const embeddingsFn = vi.fn(async (inputs: string[]) => {
      const batchSize = inputs.length;
      const dimension = 3;
      const values: number[] = [];

      for (let index = 0; index < batchSize * dimension; index += 1) {
        values.push(index);
      }

      const data: { length: number; [index: number]: number } = {
        length: values.length,
      };

      values.forEach((value, index) => {
        data[index] = value;
      });

      return {
        dims: [batchSize, dimension],
        data,
      };
    });

    pipelineMock.mockResolvedValueOnce(embeddingsFn);

    const POST = await loadPost();

    // First request should return 503 while the model initializes.
    const initializingResponse = await POST(
      createRequest({ inputs: ["alpha", "beta"] }),
    );
    const initializingJson = await initializingResponse.json();

    expect(initializingResponse.status).toBe(503);
    expect(initializingJson.status).toBe("initializing");

    await Promise.resolve();

    const response = await POST(
      createRequest({ inputs: ["alpha", "beta"] }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.model).toBe("Xenova/all-MiniLM-L6-v2");
    expect(json.embeddings).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(json.dimensions).toBe(3);
    expect(embeddingsFn).toHaveBeenCalledWith(["alpha", "beta"], {
      pooling: "mean",
      normalize: true,
    });
  });

  it("returns 500 when embeddings rows have inconsistent dimensions", async () => {
    vi.resetModules();

    const transformers = await import("@xenova/transformers");
    const pipelineMock = transformers.pipeline as unknown as ReturnType<
      typeof vi.fn
    >;

    const embeddingsFn = vi.fn(async () => ({
      tolist: () => [
        [0, 1, 2],
        [3, 4],
      ],
    }));

    pipelineMock.mockResolvedValueOnce(embeddingsFn);

    const POST = await loadPost();

    // First request returns a cold-start 503.
    const initializingResponse = await POST(
      createRequest({ inputs: ["alpha", "beta"] }),
    );
    expect(initializingResponse.status).toBe(503);

    await Promise.resolve();

    // Once initialized, inconsistent row dimensions are treated as an error.
    const response = await POST(
      createRequest({ inputs: ["alpha", "beta"] }),
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({
      error: "Embeddings model returned rows with inconsistent dimensions.",
    });
  });

  it("returns 500 when the embeddings model fails to initialize", async () => {
    vi.resetModules();

    const transformers = await import("@xenova/transformers");
    const pipelineMock = transformers.pipeline as unknown as ReturnType<
      typeof vi.fn
    >;

    pipelineMock.mockRejectedValueOnce(new Error("Failed to load model"));

    const POST = await loadPost();

    // The first request sees the model as still initializing and returns 503.
    const initializingResponse = await POST(createRequest({ inputs: ["hello"] }));
    expect(initializingResponse.status).toBe(503);

    // Allow the rejected init promise to settle and set the init error.
    await Promise.resolve();

    const response = await POST(createRequest({ inputs: ["hello"] }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to initialize embeddings model.");
    expect(json.details).toContain("Failed to load model");
  });

  it("returns cached embeddings without invoking the model when available", async () => {
    vi.resetModules();

    delete process.env.KV_REST_API_URL;
    delete process.env.VERCEL_KV_REST_API_URL;
    delete process.env.KV_URL;

    const { setCachedEmbedding } = (await import("@/lib/embeddings/cache")) as typeof import("@/lib/embeddings/cache");

    await setCachedEmbedding("cached text", "Xenova/all-MiniLM-L6-v2", [
      10,
      20,
      30,
    ]);

    const POST = await loadPost();

    const response = await POST(createRequest({ inputs: ["cached text"] }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.model).toBe("Xenova/all-MiniLM-L6-v2");
    expect(json.embeddings).toEqual([[10, 20, 30]]);
    expect(json.dimensions).toBe(3);

    const transformers = await import("@xenova/transformers");
    const pipelineMock = transformers.pipeline as unknown as ReturnType<
      typeof vi.fn
    >;

    // When the cache can satisfy the request fully, we should not invoke
    // the underlying embeddings model at all.
    expect(pipelineMock).not.toHaveBeenCalled();
  });
});
