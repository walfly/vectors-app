import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestGetHandler = (request?: unknown) => Promise<Response>;

async function loadHealthGet(): Promise<TestGetHandler> {
  const mod = await import("./route");
  return (mod as unknown as { GET: TestGetHandler }).GET;
}

async function loadWarmGet(): Promise<TestGetHandler> {
  const mod = await import("../warm/route");
  return (mod as unknown as { GET: TestGetHandler }).GET;
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  vi.spyOn(globalThis as unknown as { fetch: typeof fetch }, "fetch").mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url, init);
    },
  );
}

describe("/api/health and /api/warm - proxy to embeddings server", () => {
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

  it("merges embeddings health with KV availability", async () => {
    process.env.EMBEDDINGS_SERVER_URL = "https://embeddings.example.com";
    process.env.KV_REST_API_URL = "https://example.com/kv";

    mockFetch(async (url) => {
      if (url === "https://embeddings.example.com/api/health") {
        const body = {
          status: "degraded" as const,
          modelLoaded: false,
          initializing: true,
          modelName: "Xenova/all-MiniLM-L6-v2",
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      }

      throw new Error(`Unexpected fetch call to ${url}`);
    });

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
  });

  it("reports error status when embeddings server URL is not configured", async () => {
    delete process.env.EMBEDDINGS_SERVER_URL;
    process.env.KV_REST_API_URL = "https://example.com/kv";

    const GET = await loadHealthGet();

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("error");
    expect(json.modelLoaded).toBe(false);
    expect(json.initializing).toBe(false);
    expect(json.kvAvailable).toBe(true);
    expect(String(json.modelName)).toContain("unknown");
  });

  it("proxies warm responses from the embeddings server", async () => {
    process.env.EMBEDDINGS_SERVER_URL = "https://embeddings.example.com";

    mockFetch(async (url) => {
      if (url === "https://embeddings.example.com/api/warm") {
        const body = {
          warmed: true,
          modelName: "Xenova/all-MiniLM-L6-v2",
          status: "ready" as const,
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      }

      throw new Error(`Unexpected fetch call to ${url}`);
    });

    const warmGET = await loadWarmGet();

    const warmResponse = await warmGET();
    const warmJson = await warmResponse.json();

    expect(warmResponse.status).toBe(200);
    expect(warmJson).toEqual({
      warmed: true,
      modelName: "Xenova/all-MiniLM-L6-v2",
      status: "ready",
    });
  });
});
