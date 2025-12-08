import { describe, expect, it, vi } from "vitest";

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

describe("POST /api/similarity - validation", () => {
  it("returns 400 when the JSON body cannot be parsed", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST({
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as { json: () => Promise<unknown> });

    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Invalid JSON body." });
  });

  it("returns 400 when the JSON body is not an object", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest(null));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error:
        "Invalid request body: expected a JSON object with 'vectors' and optional 'metric' field.",
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
      createRequest({ vectors: [[1, 0, 0], "not-a-vector"] }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("vectors[1]");
  });

  it("returns 400 when vectors have inconsistent dimensions", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({ vectors: [[1, 0, 0], [0, 1]] }),
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
      createRequest({ vectors: [[0, Number.NaN, 1]] }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("must be a finite number");
  });

  it("returns 400 when 'metric' is invalid", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        vectors: [
          [1, 0],
          [0, 1],
        ],
        metric: "manhattan",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain(
      "'metric' must be one of 'cosine', 'euclidean', or 'dot'",
    );
  });
});

describe("POST /api/similarity - similarity matrix computation", () => {
  it("uses cosine similarity by default and returns a square matrix", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        vectors: [
          [1, 0],
          [0, 1],
        ],
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metric).toBe("cosine");
    expect(json.matrix).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("supports the 'euclidean' metric", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        vectors: [
          [0, 0],
          [3, 4],
        ],
        metric: "euclidean",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metric).toBe("euclidean");
    expect(json.matrix).toEqual([
      [0, 5],
      [5, 0],
    ]);
  });

  it("supports the 'dot' metric", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        vectors: [
          [1, 2],
          [3, 4],
        ],
        metric: "dot",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metric).toBe("dot");
    expect(json.matrix).toEqual([
      [5, 11],
      [11, 25],
    ]);
  });
});
