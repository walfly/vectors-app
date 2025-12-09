import {
  MODEL_ID,
  ensureEmbeddingsPipelineInitializing,
  getEmbeddingsPipeline,
  getEmbeddingsPipelineError,
  isEmbeddingsPipelineReady,
  type EmbeddingsPipeline,
} from "./embeddings/pipeline";
import { getPgvectorDatabaseUrl, runPgvectorQuery } from "./pgvector";

const MAX_QUERY_LENGTH = 1024; // characters
const DEFAULT_K = 10;
const MAX_K = 100;
const EXPECTED_EMBEDDING_DIMENSIONS = 384;

export type ConceptNeighbor = {
  id: number;
  title: string;
  score: number;
  url: string;
};

export type ConceptSearchSuccessBody = {
  query: string;
  k: number;
  model: string;
  neighbors: ConceptNeighbor[];
};

export type ConceptSearchErrorBody = {
  error: string;
  details?: string;
  status?: "initializing";
  model?: string;
};

type ErrorResult = {
  ok: false;
  status: number;
  body: ConceptSearchErrorBody;
  headers?: Record<string, string>;
};

export type ConceptSearchResult =
  | {
      ok: true;
      body: ConceptSearchSuccessBody;
    }
  | ErrorResult;

type ParsedRequest = {
  query: string;
  k: number;
};

type EmbeddingsRawOutput = {
  dims?: number[];
  data?: {
    length: number;
    [index: number]: number;
  };
  tolist?: () => number[][] | number[];
};

type WikipediaTitleRow = {
  id: number;
  title: string;
  lang?: string | null;
  distance: number;
};

function parseRequestBody(body: unknown):
  | { ok: true; value: ParsedRequest }
  | ErrorResult {
  if (body === null || typeof body !== "object") {
    return {
      ok: false,
      status: 400,
      body: {
        error:
          "Invalid request body: expected a JSON object with 'query' and optional 'k' fields.",
      },
    };
  }

  const { query, k } = body as { query?: unknown; k?: unknown };

  if (typeof query !== "string") {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Invalid request body: 'query' must be a string.",
      },
    };
  }

  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Invalid request body: 'query' must be a non-empty string.",
      },
    };
  }

  if (trimmedQuery.length > MAX_QUERY_LENGTH) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Invalid request body: 'query' must be at most ${MAX_QUERY_LENGTH} characters long.`,
      },
    };
  }

  let normalizedK: number;

  if (typeof k === "undefined") {
    normalizedK = DEFAULT_K;
  } else if (typeof k !== "number" || !Number.isFinite(k)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Invalid request body: 'k' must be a finite number.",
      },
    };
  } else if (!Number.isInteger(k)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Invalid request body: 'k' must be an integer.",
      },
    };
  } else if (k < 1 || k > MAX_K) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Invalid request body: 'k' must be between 1 and ${MAX_K}.`,
      },
    };
  } else {
    normalizedK = k;
  }

  return {
    ok: true,
    value: {
      query: trimmedQuery,
      k: normalizedK,
    },
  };
}

function ensureEmbeddingsPipelineReady():
  | { ok: true; pipeline: EmbeddingsPipeline }
  | ErrorResult {
  ensureEmbeddingsPipelineInitializing();

  const initError = getEmbeddingsPipelineError();

  if (initError) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "Failed to initialize embeddings model.",
        details: initError.message,
      },
    };
  }

  if (!isEmbeddingsPipelineReady()) {
    return {
      ok: false,
      status: 503,
      body: {
        error:
          "Embeddings model is still loading. Please try again shortly.",
        status: "initializing",
        model: MODEL_ID,
      },
      headers: {
        "Retry-After": "5",
      },
    };
  }

  const pipeline = getEmbeddingsPipeline();

  if (!pipeline) {
    return {
      ok: false,
      status: 500,
      body: {
        error:
          "Embeddings pipeline missing despite ready status. See server logs for details.",
      },
    };
  }

  return { ok: true, pipeline };
}

function extractEmbeddingsFromModelOutput(
  rawOutput: EmbeddingsRawOutput,
  expectedBatchSize: number,
): number[][] {
  if (typeof rawOutput.tolist === "function") {
    const list = rawOutput.tolist();

    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(
        "Embeddings model returned empty or invalid list output.",
      );
    }

    const embeddings = Array.isArray(list[0])
      ? (list as number[][])
      : [list as number[]];

    if (embeddings.length !== expectedBatchSize) {
      throw new Error(
        `Embeddings batch size mismatch: expected ${expectedBatchSize}, got ${embeddings.length}.`,
      );
    }

    return embeddings;
  }

  if (
    rawOutput.data &&
    Array.isArray(rawOutput.dims) &&
    rawOutput.dims.length === 2
  ) {
    const [batchSize, dimension] = rawOutput.dims;
    const expectedLength = batchSize * dimension;

    if (rawOutput.data.length !== expectedLength) {
      throw new Error(
        `Embeddings model returned data with unexpected length: expected ${expectedLength}, got ${rawOutput.data.length}.`,
      );
    }

    const flat = Array.from(rawOutput.data);
    const embeddings: number[][] = [];

    for (let index = 0; index < batchSize; index += 1) {
      const start = index * dimension;
      const end = start + dimension;
      embeddings.push(flat.slice(start, end));
    }

    if (embeddings.length !== expectedBatchSize) {
      throw new Error(
        `Embeddings batch size mismatch: expected ${expectedBatchSize}, got ${embeddings.length}.`,
      );
    }

    return embeddings;
  }

  const shapeDescription = {
    hasTolist: typeof rawOutput.tolist === "function",
    dims: Array.isArray(rawOutput.dims)
      ? rawOutput.dims.slice(0, 8)
      : rawOutput.dims,
    dataLength:
      rawOutput.data && typeof rawOutput.data.length === "number"
        ? rawOutput.data.length
        : undefined,
  };

  let shapeJson = "<unserializable>";

  try {
    shapeJson = JSON.stringify(shapeDescription);
  } catch {
    // Best-effort diagnostics only; avoid throwing from JSON.stringify itself.
  }

  throw new Error(
    `Unexpected embeddings output format from model. Observed shape: ${shapeJson}.`,
  );
}

function assertEmbeddingDimensions(embeddings: number[][]): void {
  if (!embeddings.length) {
    throw new Error("Embeddings model returned empty output.");
  }

  const dimension = embeddings[0]?.length ?? 0;

  if (dimension !== EXPECTED_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embeddings dimension mismatch: expected ${EXPECTED_EMBEDDING_DIMENSIONS}, got ${dimension}.`,
    );
  }

  const inconsistentRow = embeddings.find(
    (row) => !Array.isArray(row) || row.length !== dimension,
  );

  if (inconsistentRow) {
    throw new Error(
      "Embeddings model returned rows with inconsistent dimensions.",
    );
  }

  for (let rowIndex = 0; rowIndex < embeddings.length; rowIndex += 1) {
    const row = embeddings[rowIndex];

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const value = row[columnIndex];

      if (!Number.isFinite(value)) {
        throw new Error(
          `Embeddings model returned non-finite value at [${rowIndex}, ${columnIndex}] (NaN/Infinity).`,
        );
      }
    }
  }
}

async function embedQuery(
  pipeline: EmbeddingsPipeline,
  query: string,
): Promise<ErrorResult | { ok: true; embedding: number[] }> {
  let rawOutput: EmbeddingsRawOutput;

  try {
    rawOutput = (await pipeline([query], {
      pooling: "mean",
      normalize: true,
    })) as EmbeddingsRawOutput;
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "Failed to generate query embedding.",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }

  try {
    const embeddings = extractEmbeddingsFromModelOutput(rawOutput, 1);

    assertEmbeddingDimensions(embeddings);

    return { ok: true, embedding: embeddings[0] };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "Unexpected embeddings output format from model.",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function buildWikipediaUrl(title: string, lang: string | null | undefined) {
  const normalizedLang = (lang ?? "en").trim() || "en";
  const hostname = `${normalizedLang}.wikipedia.org`;

  const normalizedTitle = title.trim().replace(/\s+/g, "_");
  const encodedTitle = encodeURIComponent(normalizedTitle);

  return `https://${hostname}/wiki/${encodedTitle}`;
}

function distanceToScore(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) {
    return 0;
  }

  return 1 / (1 + distance);
}

async function queryWikipediaTitleNeighbors(
  embedding: number[],
  k: number,
): Promise<ErrorResult | { ok: true; neighbors: ConceptNeighbor[] }> {
  const databaseUrl = getPgvectorDatabaseUrl();

  if (!databaseUrl) {
    return {
      ok: false,
      status: 503,
      body: {
        error: "Concept search database is not configured.",
        details:
          "PGVECTOR_DATABASE_URL environment variable is not set. Configure it with a Postgres connection string to enable concept search.",
      },
    };
  }

  const sql = `
SELECT
  id,
  title,
  lang,
  embedding <-> CAST($1::double precision[] AS vector(${EXPECTED_EMBEDDING_DIMENSIONS})) AS distance
FROM wikipedia_title_embeddings
ORDER BY distance ASC
LIMIT $2;
` as const;

  let result;

  try {
    result = await runPgvectorQuery<WikipediaTitleRow>(sql, [
      embedding,
      k,
    ] as const);
  } catch (error) {
    return {
      ok: false,
      status: 503,
      body: {
        error: "Failed to query concept search database.",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const neighbors: ConceptNeighbor[] = result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    score: distanceToScore(row.distance),
    url: buildWikipediaUrl(row.title, row.lang),
  }));

  return { ok: true, neighbors };
}

export async function executeConceptSearch(
  body: unknown,
): Promise<ConceptSearchResult> {
  const parsed = parseRequestBody(body);

  if (!parsed.ok) {
    return parsed;
  }

  const { query, k } = parsed.value;

  const pipelineResult = ensureEmbeddingsPipelineReady();

  if (!pipelineResult.ok) {
    return pipelineResult;
  }

  const embedded = await embedQuery(pipelineResult.pipeline, query);

  if (!embedded.ok) {
    return embedded;
  }

  const neighborResult = await queryWikipediaTitleNeighbors(
    embedded.embedding,
    k,
  );

  if (!neighborResult.ok) {
    return neighborResult;
  }

  return {
    ok: true,
    body: {
      query,
      k,
      model: MODEL_ID,
      neighbors: neighborResult.neighbors,
    },
  };
}
