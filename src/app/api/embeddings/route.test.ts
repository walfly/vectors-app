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

  it("returns 500 when the embeddings model fails to initialize", async () => {
    vi.resetModules();

    const transformers = await import("@xenova/transformers");
    const pipelineMock = transformers.pipeline as unknown as ReturnType<
      typeof vi.fn
    >;

    pipelineMock.mockRejectedValueOnce(new Error("Failed to load model"));

    const POST = await loadPost();

    const response = await POST(createRequest({ inputs: ["hello"] }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to initialize embeddings model.");
    expect(json.details).toContain("Failed to load model");
  });
});
