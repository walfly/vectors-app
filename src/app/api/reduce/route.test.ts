import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/vectors", () => ({
  reduceWithPCA: vi.fn(),
  reduceWithUMAP: vi.fn(),
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

describe("POST /api/reduce - validation", () => {
  it("returns 400 when the JSON body is not an object", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest(null));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error:
        "Invalid request body: expected a JSON object with 'vectors', and optional 'method' and 'dimensions' fields.",
    });
  });

  it("returns 400 when 'vectors' is missing or not an array", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({}));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error:
        "Invalid request body: 'vectors' must be a non-empty array of numeric vectors.",
    });
  });

  it("returns 400 when 'vectors' is empty", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({ vectors: [] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error:
        "Invalid request body: 'vectors' array must contain at least one vector.",
    });
  });

  it("returns 400 when any vector row is not an array", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({ vectors: [[0, 1, 2], "not-a-vector"] }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("vectors[1]");
  });

  it("returns 400 when any vector row is empty", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({ vectors: [[0, 1], []] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("must not be empty");
  });

  it("returns 400 when vectors have inconsistent dimensions", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({ vectors: [[0, 1, 2], [3, 4]] }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain(
      "all vectors must have the same length (input dimension)",
    );
  });

  it("returns 400 when any entry is not a finite number", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({ vectors: [[0, Number.NaN, 2]] }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("must be a finite number");
  });

  it("returns 400 when 'method' is invalid", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        vectors: [[0, 1, 2]],
        method: "tsne",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("'method' must be either 'pca' or 'umap'");
  });

  it("returns 400 when 'dimensions' is invalid", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        vectors: [[0, 1, 2]],
        dimensions: 4,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain(
      "'dimensions' must be either 2 or 3 if provided",
    );
  });

  it("returns 400 when 'dimensions' is greater than the input dimension", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        vectors: [[0, 1]],
        dimensions: 3,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain(
      "cannot be greater than the input vector dimension",
    );
  });
});

describe("POST /api/reduce - dimensionality reduction", () => {
  it("uses PCA by default when method and dimensions are omitted", async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const vectorsModule = await import("../../../lib/vectors");
    const reduceWithPCA = vectorsModule
      .reduceWithPCA as unknown as ReturnType<typeof vi.fn>;
    const reduceWithUMAP = vectorsModule
      .reduceWithUMAP as unknown as ReturnType<typeof vi.fn>;

    reduceWithPCA.mockReturnValueOnce([
      [0, 0, 0],
      [1, 1, 1],
    ]);

    const POST = await loadPost();

    const response = await POST(
      createRequest({ vectors: [[0, 1, 2], [3, 4, 5]] }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      points: [
        [0, 0, 0],
        [1, 1, 1],
      ],
      method: "pca",
    });

    expect(reduceWithPCA).toHaveBeenCalledWith(
      [
        [0, 1, 2],
        [3, 4, 5],
      ],
      3,
    );
    expect(reduceWithUMAP).not.toHaveBeenCalled();
  });

  it("uses UMAP when method is 'umap' and dimensions is 2", async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const vectorsModule = await import("../../../lib/vectors");
    const reduceWithPCA = vectorsModule
      .reduceWithPCA as unknown as ReturnType<typeof vi.fn>;
    const reduceWithUMAP = vectorsModule
      .reduceWithUMAP as unknown as ReturnType<typeof vi.fn>;

    reduceWithUMAP.mockReturnValueOnce([
      [0, 1],
      [2, 3],
    ]);

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        vectors: [[0, 1, 2], [3, 4, 5]],
        method: "umap",
        dimensions: 2,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      points: [
        [0, 1],
        [2, 3],
      ],
      method: "umap",
    });

    expect(reduceWithUMAP).toHaveBeenCalledWith(
      [
        [0, 1, 2],
        [3, 4, 5],
      ],
      2,
    );
    expect(reduceWithPCA).not.toHaveBeenCalled();
  });
});
