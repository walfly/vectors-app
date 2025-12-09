import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./embeddings/pipeline", () => ({
  MODEL_ID: "TestModel",
  ensureEmbeddingsPipelineInitializing: vi.fn(),
  getEmbeddingsPipeline: vi.fn(),
  getEmbeddingsPipelineError: vi.fn(),
  isEmbeddingsPipelineReady: vi.fn(),
}));

vi.mock("./pgvector", () => ({
  getPgvectorDatabaseUrl: vi.fn(),
  runPgvectorQuery: vi.fn(),
}));

type ConceptSearchModule = typeof import("./concept-search");

async function loadConceptSearchModule(): Promise<ConceptSearchModule> {
  const mod = await import("./concept-search");
  return mod as ConceptSearchModule;
}

describe("concept search service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 400 for non-object request bodies", async () => {
    const { executeConceptSearch } = await loadConceptSearchModule();

    const result = await executeConceptSearch(null);

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.status).toBe(400);
    expect(result.body.error).toContain("expected a JSON object");
  });

  it("returns 400 when 'query' is not a string", async () => {
    const { executeConceptSearch } = await loadConceptSearchModule();

    const invalidBodies = [{}, { query: 123 }, { query: [] }];

    for (const body of invalidBodies) {
      // eslint-disable-next-line no-await-in-loop
      const result = await executeConceptSearch(body);

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.body.error).toContain("'query' must be a string");
      }
    }
  });

  it("returns 400 when 'query' is empty or whitespace-only", async () => {
    const { executeConceptSearch } = await loadConceptSearchModule();

    const invalidBodies = [{ query: "" }, { query: "   " }, { query: "\n\t" }];

    for (const body of invalidBodies) {
      // eslint-disable-next-line no-await-in-loop
      const result = await executeConceptSearch(body);

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.body.error).toContain(
          "'query' must be a non-empty string",
        );
      }
    }
  });

  it("returns 400 when 'query' exceeds the maximum length", async () => {
    const { executeConceptSearch } = await loadConceptSearchModule();

    const longQuery = "x".repeat(1025);

    const result = await executeConceptSearch({ query: longQuery });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.body.error).toContain(
        "'query' must be at most 1024 characters long",
      );
    }
  });

  it("returns 400 for invalid k values", async () => {
    const { executeConceptSearch } = await loadConceptSearchModule();

    const invalidBodies = [
      { query: "climate change", k: 0 },
      { query: "climate change", k: 101 },
      { query: "climate change", k: -1 },
      { query: "climate change", k: 1.5 },
      { query: "climate change", k: "not-a-number" },
    ];

    for (const body of invalidBodies) {
      // eslint-disable-next-line no-await-in-loop
      const result = await executeConceptSearch(body);

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.body.error).toMatch(/'k'/);
      }
    }
  });

  it("returns 503 when PGVECTOR_DATABASE_URL is not configured", async () => {
    const embeddingsPipeline = await import("./embeddings/pipeline");
    const getEmbeddingsPipelineErrorMock =
      embeddingsPipeline.getEmbeddingsPipelineError as unknown as ReturnType<
        typeof vi.fn
      >;
    const isEmbeddingsPipelineReadyMock =
      embeddingsPipeline.isEmbeddingsPipelineReady as unknown as ReturnType<
        typeof vi.fn
      >;
    const getEmbeddingsPipelineMock =
      embeddingsPipeline.getEmbeddingsPipeline as unknown as ReturnType<
        typeof vi.fn
      >;

    getEmbeddingsPipelineErrorMock.mockReturnValue(null);
    isEmbeddingsPipelineReadyMock.mockReturnValue(true);

    const embedding = Array.from({ length: 384 }, (_, index) => index + 1);

    const pipelineFn = vi.fn(async () => ({
      tolist: () => [embedding],
    }));

    getEmbeddingsPipelineMock.mockReturnValue(pipelineFn);

    const pgvector = await import("./pgvector");
    const getPgvectorDatabaseUrlMock =
      pgvector.getPgvectorDatabaseUrl as unknown as ReturnType<typeof vi.fn>;

    getPgvectorDatabaseUrlMock.mockReturnValue(null);

    const { executeConceptSearch } = await loadConceptSearchModule();

    const result = await executeConceptSearch({ query: "climate change" });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.status).toBe(503);
    expect(result.body.error).toContain("Concept search database is not configured");
  });

  it("returns 503 when the database query fails", async () => {
    const embeddingsPipeline = await import("./embeddings/pipeline");
    const getEmbeddingsPipelineErrorMock =
      embeddingsPipeline.getEmbeddingsPipelineError as unknown as ReturnType<
        typeof vi.fn
      >;
    const isEmbeddingsPipelineReadyMock =
      embeddingsPipeline.isEmbeddingsPipelineReady as unknown as ReturnType<
        typeof vi.fn
      >;
    const getEmbeddingsPipelineMock =
      embeddingsPipeline.getEmbeddingsPipeline as unknown as ReturnType<
        typeof vi.fn
      >;

    getEmbeddingsPipelineErrorMock.mockReturnValue(null);
    isEmbeddingsPipelineReadyMock.mockReturnValue(true);

    const embedding = Array.from({ length: 384 }, (_, index) => index + 1);

    const pipelineFn = vi.fn(async () => ({
      tolist: () => [embedding],
    }));

    getEmbeddingsPipelineMock.mockReturnValue(pipelineFn);

    const pgvector = await import("./pgvector");
    const getPgvectorDatabaseUrlMock =
      pgvector.getPgvectorDatabaseUrl as unknown as ReturnType<typeof vi.fn>;
    const runPgvectorQueryMock =
      pgvector.runPgvectorQuery as unknown as ReturnType<typeof vi.fn>;

    getPgvectorDatabaseUrlMock.mockReturnValue(
      "postgres://user:pass@localhost:5432/db",
    );

    const dbError = new Error("connection refused");
    runPgvectorQueryMock.mockRejectedValueOnce(dbError);

    const { executeConceptSearch } = await loadConceptSearchModule();

    const result = await executeConceptSearch({ query: "neural networks", k: 5 });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.status).toBe(503);
    expect(result.body.error).toBe("Failed to query concept search database.");
    expect(result.body.details).toContain("connection refused");
  });

  it("returns ordered neighbors on the happy path", async () => {
    const embeddingsPipeline = await import("./embeddings/pipeline");
    const getEmbeddingsPipelineErrorMock =
      embeddingsPipeline.getEmbeddingsPipelineError as unknown as ReturnType<
        typeof vi.fn
      >;
    const isEmbeddingsPipelineReadyMock =
      embeddingsPipeline.isEmbeddingsPipelineReady as unknown as ReturnType<
        typeof vi.fn
      >;
    const getEmbeddingsPipelineMock =
      embeddingsPipeline.getEmbeddingsPipeline as unknown as ReturnType<
        typeof vi.fn
      >;

    getEmbeddingsPipelineErrorMock.mockReturnValue(null);
    isEmbeddingsPipelineReadyMock.mockReturnValue(true);

    const embedding = Array.from({ length: 384 }, (_, index) => index + 1);

    const pipelineFn = vi.fn(async () => ({
      tolist: () => [embedding],
    }));

    getEmbeddingsPipelineMock.mockReturnValue(pipelineFn);

    const pgvector = await import("./pgvector");
    const getPgvectorDatabaseUrlMock =
      pgvector.getPgvectorDatabaseUrl as unknown as ReturnType<typeof vi.fn>;
    const runPgvectorQueryMock =
      pgvector.runPgvectorQuery as unknown as ReturnType<typeof vi.fn>;

    getPgvectorDatabaseUrlMock.mockReturnValue(
      "postgres://user:pass@localhost:5432/db",
    );

    runPgvectorQueryMock.mockResolvedValueOnce({
      rows: [
        { id: 2, title: "Beta", lang: "en", distance: 0.1 },
        { id: 1, title: "Alpha", lang: "en", distance: 0.5 },
      ],
      rowCount: 2,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as never);

    const { executeConceptSearch } = await loadConceptSearchModule();

    const result = await executeConceptSearch({
      query: "test query",
      k: 2,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.body.model).toBe("TestModel");
    expect(result.body.query).toBe("test query");
    expect(result.body.k).toBe(2);

    const neighbors = result.body.neighbors;
    expect(neighbors).toHaveLength(2);

    // Neighbors should preserve the database ordering (closest first) and
    // expose a score derived from the distance where higher means more
    // similar.
    expect(neighbors[0]?.id).toBe(2);
    expect(neighbors[0]?.title).toBe("Beta");
    expect(neighbors[0]?.score).toBeGreaterThan(neighbors[1]?.score ?? 0);
    expect(neighbors[0]?.url).toBe(
      "https://en.wikipedia.org/wiki/Beta",
    );
  });

  it("omits neighbors with empty or whitespace-only titles", async () => {
    const embeddingsPipeline = await import("./embeddings/pipeline");
    const getEmbeddingsPipelineErrorMock =
      embeddingsPipeline.getEmbeddingsPipelineError as unknown as ReturnType<
        typeof vi.fn
      >;
    const isEmbeddingsPipelineReadyMock =
      embeddingsPipeline.isEmbeddingsPipelineReady as unknown as ReturnType<
        typeof vi.fn
      >;
    const getEmbeddingsPipelineMock =
      embeddingsPipeline.getEmbeddingsPipeline as unknown as ReturnType<
        typeof vi.fn
      >;

    getEmbeddingsPipelineErrorMock.mockReturnValue(null);
    isEmbeddingsPipelineReadyMock.mockReturnValue(true);

    const embedding = Array.from({ length: 384 }, (_, index) => index + 1);

    const pipelineFn = vi.fn(async () => ({
      tolist: () => [embedding],
    }));

    getEmbeddingsPipelineMock.mockReturnValue(pipelineFn);

    const pgvector = await import("./pgvector");
    const getPgvectorDatabaseUrlMock =
      pgvector.getPgvectorDatabaseUrl as unknown as ReturnType<typeof vi.fn>;
    const runPgvectorQueryMock =
      pgvector.runPgvectorQuery as unknown as ReturnType<typeof vi.fn>;

    getPgvectorDatabaseUrlMock.mockReturnValue(
      "postgres://user:pass@localhost:5432/db",
    );

    runPgvectorQueryMock.mockResolvedValueOnce({
      rows: [
        { id: 1, title: "  ", lang: "en", distance: 0.1 },
        { id: 2, title: "Valid title", lang: "en", distance: 0.2 },
      ],
      rowCount: 2,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as never);

    const { executeConceptSearch } = await loadConceptSearchModule();

    const result = await executeConceptSearch({
      query: "test query",
      k: 2,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const neighbors = result.body.neighbors;
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0]?.id).toBe(2);
    expect(neighbors[0]?.title).toBe("Valid title");
    expect(neighbors[0]?.url).toBe(
      "https://en.wikipedia.org/wiki/Valid_title",
    );
  });
});
