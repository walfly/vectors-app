import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EXPECTED_EMBEDDING_DIMENSIONS,
  WIKIPEDIA_TITLES_LANG,
} from "./wikipedia-titles-backfill";

vi.mock("./pgvector", () => ({
  runPgvectorQuery: vi.fn(),
}));

type WikipediaNearestModule = typeof import("./wikipedia-nearest");

async function loadWikipediaNearestModule(): Promise<WikipediaNearestModule> {
  const mod = await import("./wikipedia-nearest");
  return mod as WikipediaNearestModule;
}

function buildUnitVector(): number[] {
  const dimension = EXPECTED_EMBEDDING_DIMENSIONS;
  const vector = new Array<number>(dimension);

  for (let index = 0; index < dimension; index += 1) {
    vector[index] = index === 0 ? 1 : 0;
  }

  return vector;
}

describe("parseWikipediaNearestRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an error when the body is not an object", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const result = parseWikipediaNearestRequest(null);

    if (!("error" in result)) {
      throw new Error("Expected validation error for non-object body");
    }

    expect(result.error).toContain("expected a JSON object");
  });

  it("returns an error when 'query' is missing or not an array", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const result = parseWikipediaNearestRequest({});

    if (!("error" in result)) {
      throw new Error("Expected validation error for missing query");
    }

    expect(result.error).toContain("'query' must be a non-empty array");
  });

  it("returns an error when 'query' is empty", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const result = parseWikipediaNearestRequest({ query: [] });

    if (!("error" in result)) {
      throw new Error("Expected validation error for empty query vector");
    }

    expect(result.error).toContain("'query' vector must not be empty");
  });

  it("returns an error when 'query' has the wrong dimensionality", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const vector = new Array<number>(EXPECTED_EMBEDDING_DIMENSIONS - 1).fill(0);

    const result = parseWikipediaNearestRequest({ query: vector });

    if (!("error" in result)) {
      throw new Error("Expected validation error for dimension mismatch");
    }

    expect(result.error).toContain("same dimension as wikipedia_title_embeddings");
    expect(String(result.details)).toContain(
      `Expected ${EXPECTED_EMBEDDING_DIMENSIONS} dimensions`,
    );
  });

  it("returns an error when any query entry is not a finite number", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const vector = buildUnitVector();
    vector[10] = Number.NaN;

    const result = parseWikipediaNearestRequest({ query: vector });

    if (!("error" in result)) {
      throw new Error("Expected validation error for non-finite query entry");
    }

    expect(result.error).toContain("query[10]");
  });

  it("returns an error when 'k' is invalid", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const vector = buildUnitVector();

    const result = parseWikipediaNearestRequest({ query: vector, k: 0 });

    if (!("error" in result)) {
      throw new Error("Expected validation error for invalid k");
    }

    expect(result.error).toContain("'k' must be a positive integer");
  });

  it("returns an error when 'k' exceeds the maximum allowed value", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const vector = buildUnitVector();

    const result = parseWikipediaNearestRequest({ query: vector, k: 26 });

    if (!("error" in result)) {
      throw new Error("Expected validation error for k above maximum");
    }

    expect(result.error).toContain("must not be greater than 25");
  });

  it("returns an error when 'lang' is not a non-empty string", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const vector = buildUnitVector();

    const result = parseWikipediaNearestRequest({ query: vector, lang: "" });

    if (!("error" in result)) {
      throw new Error("Expected validation error for empty lang");
    }

    expect(result.error).toContain("'lang' must be a non-empty string");
  });

  it("parses a valid request and applies defaults for 'k' and 'lang'", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const vector = buildUnitVector();

    const result = parseWikipediaNearestRequest({ query: vector });

    if ("error" in result) {
      throw new Error("Expected successful parse for valid request");
    }

    expect(result).toEqual({
      query: vector,
      k: 5,
      lang: WIKIPEDIA_TITLES_LANG,
    });
  });

  it("parses an explicit 'k' and 'lang' value", async () => {
    const { parseWikipediaNearestRequest } = await loadWikipediaNearestModule();

    const vector = buildUnitVector();

    const result = parseWikipediaNearestRequest({
      query: vector,
      k: 3,
      lang: "en",
    });

    if ("error" in result) {
      throw new Error("Expected successful parse for explicit k and lang");
    }
    expect(result).toEqual({
      query: vector,
      k: 3,
      lang: "en",
    });
  });
});

describe("findWikipediaNearest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates to runPgvectorQuery and maps rows into neighbors", async () => {
    const pgModule = await import("./pgvector");
    const runPgvectorQuery = pgModule
      .runPgvectorQuery as unknown as ReturnType<typeof vi.fn>;

    runPgvectorQuery.mockResolvedValueOnce({
      rows: [
        { title: "Cats", score: 0.92 },
        { title: "Dogs", score: 0.88 },
      ],
      rowCount: 2,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as never);

    const { findWikipediaNearest } = await loadWikipediaNearestModule();

    const query = buildUnitVector();

    const neighbors = await findWikipediaNearest({
      query,
      k: 5,
      lang: "en",
    });

    expect(runPgvectorQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = runPgvectorQuery.mock.calls[0] ?? [];

    expect(typeof sql).toBe("string");
    expect(String(sql)).toContain("FROM wikipedia_title_embeddings");
    expect(params).toEqual([query, "en", 5]);

    expect(neighbors).toEqual([
      { title: "Cats", score: 0.92 },
      { title: "Dogs", score: 0.88 },
    ]);
  });

  it("filters out rows with missing titles or non-finite scores", async () => {
    const pgModule = await import("./pgvector");
    const runPgvectorQuery = pgModule
      .runPgvectorQuery as unknown as ReturnType<typeof vi.fn>;

    runPgvectorQuery.mockResolvedValueOnce({
      rows: [
        { title: "Valid", score: 0.9 },
        { title: null, score: 0.8 },
        { title: "BadScore", score: Number.NaN },
      ],
      rowCount: 3,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as never);

    const { findWikipediaNearest } = await loadWikipediaNearestModule();

    const query = buildUnitVector();

    const neighbors = await findWikipediaNearest({
      query,
      k: 5,
      lang: "en",
    });

    expect(neighbors).toEqual([{ title: "Valid", score: 0.9 }]);
  });
});
