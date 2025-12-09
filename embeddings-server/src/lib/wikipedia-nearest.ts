import { runPgvectorQuery } from "./pgvector";
import {
  EXPECTED_EMBEDDING_DIMENSIONS,
  WIKIPEDIA_TITLES_LANG,
} from "./wikipedia-titles-backfill";

export type WikipediaNearestRequestBody = {
  query?: unknown;
  k?: unknown;
  lang?: unknown;
};

export type WikipediaNearestRequest = {
  query: number[];
  k: number;
  lang: string;
};

export type WikipediaNeighbor = {
  title: string;
  score: number;
};

export type WikipediaNearestResponseBody = {
  metric: "cosine";
  neighbors: WikipediaNeighbor[];
};

export type WikipediaNearestErrorBody = {
  error: string;
  details?: string;
};

const DEFAULT_K = 5;
const MAX_K = 25;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseWikipediaNearestRequest(
  body: unknown,
): WikipediaNearestRequest | WikipediaNearestErrorBody {
  if (body === null || typeof body !== "object") {
    return {
      error:
        "Invalid request body: expected a JSON object with 'query' and optional 'k' and 'lang' fields.",
    };
  }

  const { query, k, lang } = body as WikipediaNearestRequestBody;

  if (!Array.isArray(query)) {
    return {
      error:
        "Invalid request body: 'query' must be a non-empty array of numbers representing an embedding vector.",
    };
  }

  if (query.length === 0) {
    return {
      error: "Invalid request body: 'query' vector must not be empty.",
    };
  }

  if (query.length !== EXPECTED_EMBEDDING_DIMENSIONS) {
    return {
      error:
        "Invalid request body: 'query' vector must have the same dimension as wikipedia_title_embeddings.",
      details: `Expected ${EXPECTED_EMBEDDING_DIMENSIONS} dimensions, got ${query.length}.`,
    };
  }

  const numericQuery = new Array<number>(query.length);

  for (let index = 0; index < query.length; index += 1) {
    const value = query[index];

    if (!isFiniteNumber(value)) {
      return {
        error: `Invalid request body: 'query[${index}]' must be a finite number.`,
      };
    }

    numericQuery[index] = value;
  }

  let kValue: number;

  if (k === undefined) {
    kValue = DEFAULT_K;
  } else if (!isFiniteNumber(k) || !Number.isInteger(k) || k <= 0) {
    return {
      error:
        "Invalid request body: 'k' must be a positive integer when provided.",
    };
  } else if (k > MAX_K) {
    return {
      error: `Invalid request body: 'k' must not be greater than ${MAX_K}.`,
    };
  } else {
    kValue = k;
  }

  let langValue: string;

  if (lang === undefined) {
    langValue = WIKIPEDIA_TITLES_LANG;
  } else if (typeof lang !== "string") {
    return {
      error:
        "Invalid request body: 'lang' must be a non-empty string when provided.",
    };
  } else {
    const trimmed = lang.trim();

    if (!trimmed) {
      return {
        error:
          "Invalid request body: 'lang' must be a non-empty string when provided.",
      };
    }

    langValue = trimmed;
  }

  return {
    query: numericQuery,
    k: kValue,
    lang: langValue,
  };
}

type WikipediaNearestRow = {
  title: string;
  score: number;
};

export async function findWikipediaNearest(
  request: WikipediaNearestRequest,
): Promise<WikipediaNeighbor[]> {
  const dimension = EXPECTED_EMBEDDING_DIMENSIONS;

  const sql = `
SELECT
  title,
  1 - (embedding <=> CAST($1::double precision[] AS vector(${dimension}))) AS score
FROM wikipedia_title_embeddings
WHERE lang = $2
ORDER BY embedding <=> CAST($1::double precision[] AS vector(${dimension}))
LIMIT $3;
` as const;

  const result = await runPgvectorQuery<WikipediaNearestRow>(sql, [
    request.query,
    request.lang,
    request.k,
  ]);

  const neighbors: WikipediaNeighbor[] = [];

  for (const row of result.rows) {
    if (typeof row.title !== "string") {
      continue;
    }

    const score = row.score;

    if (typeof score !== "number" || !Number.isFinite(score)) {
      continue;
    }

    neighbors.push({ title: row.title, score });
  }

  return neighbors;
}
