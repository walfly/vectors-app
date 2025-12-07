import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestPostHandler = (request: {
  text: () => Promise<string>;
}) => Promise<Response>;

async function loadPost(): Promise<TestPostHandler> {
  const mod = await import("./route");
  return (mod as unknown as { POST: TestPostHandler }).POST;
}

function createRequest(bodyText: string) {
  return {
    text: async () => bodyText,
  };
}

describe("POST /api/embeddings - proxy to embeddings server", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("returns 500 when EMBEDDINGS_SERVER_URL is not configured", async () => {
    delete process.env.EMBEDDINGS_SERVER_URL;

    const POST = await loadPost();

    const response = await POST(createRequest("{}"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toContain("Embeddings server URL is not configured");
  });

  it("forwards successful JSON responses from the embeddings server", async () => {
    process.env.EMBEDDINGS_SERVER_URL = "https://embeddings.example.com";

    const fetchSpy = vi
      .spyOn(globalThis as unknown as { fetch: typeof fetch }, "fetch")
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        expect(url).toBe("https://embeddings.example.com/api/embeddings");
        expect(init?.method).toBe("POST");

        const body = {
          model: "Xenova/all-MiniLM-L6-v2",
          embeddings: [[0, 1, 2]],
          dimensions: 3,
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      });

    const POST = await loadPost();

    const response = await POST(
      createRequest(JSON.stringify({ inputs: ["foo", "bar"] })),
    );
    const json = await response.json();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(json).toEqual({
      model: "Xenova/all-MiniLM-L6-v2",
      embeddings: [[0, 1, 2]],
      dimensions: 3,
    });
  });

  it("returns 502 when the embeddings server is unreachable", async () => {
    process.env.EMBEDDINGS_SERVER_URL = "https://embeddings.example.com";

    vi.spyOn(globalThis as unknown as { fetch: typeof fetch }, "fetch").mockImplementation(
      async () => {
        throw new Error("connect ECONNREFUSED");
      },
    );

    const POST = await loadPost();

    const response = await POST(createRequest("{}"));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toBe("Failed to reach embeddings server.");
    expect(json.details).toContain("ECONNREFUSED");
  });

  it("forwards initializing 503 responses including Retry-After header", async () => {
    process.env.EMBEDDINGS_SERVER_URL = "https://embeddings.example.com";

    vi.spyOn(globalThis as unknown as { fetch: typeof fetch }, "fetch").mockImplementation(
      async () => {
        const body = {
          error: "Embeddings model is still loading. Please try again shortly.",
          status: "initializing",
          model: "Xenova/all-MiniLM-L6-v2",
        };

        return new Response(JSON.stringify(body), {
          status: 503,
          headers: {
            "content-type": "application/json",
            "retry-after": "5",
          },
        });
      },
    );

    const POST = await loadPost();

    const response = await POST(createRequest("{}"));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(json).toEqual({
      error: "Embeddings model is still loading. Please try again shortly.",
      status: "initializing",
      model: "Xenova/all-MiniLM-L6-v2",
    });
  });
});
