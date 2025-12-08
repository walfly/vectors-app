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

describe("POST /api/arithmetic - validation", () => {
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
        "Invalid request body: expected a JSON object with 'terms' and optional 'candidates', 'k', and 'metric' fields.",
    });
  });

  it("returns 400 when 'terms' is missing or not an array", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({}));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("'terms' must be a non-empty array");
  });

  it("returns 400 when 'terms' is empty", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({ terms: [] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("'terms' array must contain at least one term");
  });

  it("returns 400 when any term has an invalid vector or weight", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        terms: [
          { id: "a", vector: [1, 0], weight: 1 },
          { id: "b", vector: [1, Number.NaN], weight: "not-a-number" },
        ],
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("terms[1]");
  });

  it("returns 400 when 'candidates' is an empty array", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        terms: [{ id: "a", vector: [1, 0], weight: 1 }],
        candidates: [],
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain(
      "'candidates' array must contain at least one candidate when provided",
    );
  });

  it("returns 400 when 'k' is provided without candidates", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        terms: [{ id: "a", vector: [1, 0], weight: 1 }],
        k: 3,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain(
      "'k' can only be provided when 'candidates' is present and non-empty",
    );
  });

  it("returns 400 when 'metric' is invalid", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        terms: [{ id: "a", vector: [1, 0], weight: 1 }],
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

describe("POST /api/arithmetic - weighted sum and neighbors", () => {
  it("computes the weighted sum and returns only the result when candidates are omitted", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        terms: [
          { id: "king", vector: [1, 2, 3], weight: 1 },
          { id: "man", vector: [1, 1, 1], weight: -1 },
        ],
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metric).toBe("cosine");
    expect(json.result).toEqual([0, 1, 2]);
    expect(json.neighbors).toBeUndefined();
  });

  it("computes neighbors relative to the result when candidates are provided", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        terms: [
          { id: "a", vector: [1, 0], weight: 1 },
          { id: "b", vector: [0, 1], weight: 1 },
        ],
        candidates: [
          { id: "diag", vector: [1, 1] },
          { id: "x-axis", vector: [1, 0] },
          { id: "y-axis", vector: [0, 1] },
        ],
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metric).toBe("cosine");
    expect(json.result).toEqual([1, 1]);
    expect(json.neighbors.length).toBeGreaterThanOrEqual(3);
    expect(json.neighbors[0].id).toBe("diag");
  });

  it("orders neighbors by ascending Euclidean distance when metric is 'euclidean' and respects 'k'", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        terms: [{ id: "origin", vector: [0, 0], weight: 1 }],
        candidates: [
          { id: "far", vector: [3, 4] },
          { id: "mid", vector: [0, 2] },
          { id: "near", vector: [1, 0] },
        ],
        k: 2,
        metric: "euclidean",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metric).toBe("euclidean");
    expect(json.neighbors).toHaveLength(2);
    expect(json.neighbors.map((n: { id: string }) => n.id)).toEqual([
      "near",
      "mid",
    ]);
  });
});
