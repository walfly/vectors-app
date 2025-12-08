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

describe("POST /api/nearest - validation", () => {
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
        "Invalid request body: expected a JSON object with 'query', 'candidates', and optional 'k' and 'metric' fields.",
    });
  });

  it("returns 400 when 'query' is missing or not an array", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({}));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("'query' must be a non-empty array of numbers");
  });

  it("returns 400 when 'query' is empty", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({ query: [] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("'query' vector must not be empty");
  });

  it("returns 400 when any query entry is not a finite number", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({ query: [0, Number.NaN] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("query[1]");
  });

  it("returns 400 when 'candidates' is missing or not an array", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(createRequest({ query: [1, 0] }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("'candidates' must be a non-empty array");
  });

  it("returns 400 when 'candidates' is empty", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({ query: [1, 0], candidates: [] }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("'candidates' array must contain at least one candidate");
  });

  it("returns 400 when any candidate has an invalid vector", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        query: [1, 0],
        candidates: [
          { id: "a", vector: [1, 0] },
          { id: "b", vector: [1, Number.NaN] },
        ],
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("candidates[1].vector[1]");
  });

  it("returns 400 when 'k' is invalid", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        query: [1, 0],
        candidates: [{ id: "a", vector: [1, 0] }],
        k: 0,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("'k' must be a positive integer");
  });

  it("returns 400 when 'metric' is invalid", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        query: [1, 0],
        candidates: [{ id: "a", vector: [1, 0] }],
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

describe("POST /api/nearest - nearest neighbor search", () => {
  it("returns neighbors ordered by cosine similarity by default", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        query: [1, 0],
        candidates: [
          { id: "same", vector: [1, 0] },
          { id: "orthogonal", vector: [0, 1] },
          { id: "opposite", vector: [-1, 0] },
        ],
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metric).toBe("cosine");
    expect(json.neighbors.map((n: { id: string }) => n.id)).toEqual([
      "same",
      "orthogonal",
      "opposite",
    ]);
  });

  it("orders neighbors by ascending Euclidean distance when metric is 'euclidean' and respects 'k'", async () => {
    vi.resetModules();

    const POST = await loadPost();

    const response = await POST(
      createRequest({
        query: [0, 0],
        candidates: [
          { id: "far", vector: [3, 4] }, // distance 5
          { id: "mid", vector: [0, 2] }, // distance 2
          { id: "near", vector: [1, 0] }, // distance 1
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
