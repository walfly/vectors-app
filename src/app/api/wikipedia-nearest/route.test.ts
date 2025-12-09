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

describe("POST /api/wikipedia-nearest - proxy to embeddings server", () => {
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

        expect(url).toBe(
          "https://embeddings.example.com/api/wikipedia-nearest",
        );
        expect(init?.method).toBe("POST");

        const body = {
          metric: "cosine" as const,
          neighbors: [
            { title: "Cat", score: 0.9 },
            { title: "Dog", score: 0.85 },
          ],
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
      createRequest(
        JSON.stringify({
          query: [0, 1, 2],
          k: 5,
        }),
      ),
    );
    const json = await response.json();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(json).toEqual({
      metric: "cosine",
      neighbors: [
        { title: "Cat", score: 0.9 },
        { title: "Dog", score: 0.85 },
      ],
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

  it("returns 502 when the embeddings server returns a non-JSON response", async () => {
    process.env.EMBEDDINGS_SERVER_URL = "https://embeddings.example.com";

    vi.spyOn(globalThis as unknown as { fetch: typeof fetch }, "fetch").mockImplementation(
      async () => {
        return new Response("Upstream error", {
          status: 500,
          headers: {
            "content-type": "text/plain",
          },
        });
      },
    );

    const POST = await loadPost();

    const response = await POST(createRequest("{}"));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toBe("Embeddings server returned a non-JSON response.");
    expect(json.details).toContain("Upstream error");
  });

  it("returns 502 when the embeddings server returns invalid JSON", async () => {
    process.env.EMBEDDINGS_SERVER_URL = "https://embeddings.example.com";

    vi.spyOn(globalThis as unknown as { fetch: typeof fetch }, "fetch").mockImplementation(
      async () => {
        const textEncoder = new TextEncoder();
        const invalidJson = textEncoder.encode("{ not-json }");

        return new Response(invalidJson, {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    );

    const POST = await loadPost();

    const response = await POST(createRequest("{}"));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toBe("Embeddings server returned invalid JSON.");
  });
});
