// NOTE: This module is intended as a manual CLI entrypoint only.
// It must not be invoked from the HTTP server or any automatic job.

import type { EmbeddingsPipeline } from "./embeddings/pipeline";
import {
  MODEL_ID,
  ensureEmbeddingsPipelineInitializing,
  getEmbeddingsPipeline,
  getEmbeddingsPipelineError,
  getEmbeddingsPipelineInitPromise,
  isEmbeddingsPipelineReady,
} from "./embeddings/pipeline";
import {
  getPgvectorDatabaseUrl,
  runPgvectorQuery,
} from "./pgvector";

type FetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
};

type FetchFn = (input: string) => Promise<FetchResponse>;

type WikipediaAllPagesPage = {
  title?: string;
  ns?: number;
};

type WikipediaAllPagesQuery = {
  allpages?: WikipediaAllPagesPage[];
};

type WikipediaAllPagesContinue = {
  apcontinue?: string;
};

type WikipediaAllPagesResponse = {
  continue?: WikipediaAllPagesContinue;
  query?: WikipediaAllPagesQuery;
};

const WIKIPEDIA_API_URL =
  process.env.WIKIPEDIA_API_URL ?? "https://en.wikipedia.org/w/api.php";

const MIN_TITLES = 10_000;
const MAX_TITLES = 50_000;
const DEFAULT_TARGET_TITLES = 20_000;

const DEFAULT_EMBEDDING_BATCH_SIZE = 32;
const MAX_EMBEDDING_BATCH_SIZE = 128;

const EXPECTED_EMBEDDING_DIMENSIONS = 384;
const WIKIPEDIA_TITLES_LANG = "en" as const;

function getGlobalFetch(): FetchFn {
  const candidate =
    (globalThis as unknown as { fetch?: FetchFn }).fetch ?? undefined;

  if (!candidate) {
    throw new Error(
      "Global fetch is not available in this environment. Node 18+ is required to run the Wikipedia backfill script.",
    );
  }

  return candidate;
}

function getTargetTitlesCount(): number {
  const raw = process.env.WIKIPEDIA_TITLES_TARGET_COUNT;

  if (!raw) {
    return DEFAULT_TARGET_TITLES;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TARGET_TITLES;
  }

  if (parsed < MIN_TITLES) {
    return MIN_TITLES;
  }

  if (parsed > MAX_TITLES) {
    return MAX_TITLES;
  }

  return parsed;
}

function getEmbeddingBatchSize(): number {
  const raw = process.env.WIKIPEDIA_EMBEDDING_BATCH_SIZE;

  if (!raw) {
    return DEFAULT_EMBEDDING_BATCH_SIZE;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_EMBEDDING_BATCH_SIZE;
  }

  if (parsed > MAX_EMBEDDING_BATCH_SIZE) {
    return MAX_EMBEDDING_BATCH_SIZE;
  }

  return parsed;
}

function buildWikipediaAllPagesUrl(
  apcontinue: string | undefined,
  limit: number,
): string {
  const params: string[] = [
    "action=query",
    "format=json",
    "formatversion=2",
    "list=allpages",
    "apnamespace=0",
    "aplimit=".concat(limit.toString()),
    "apfilterredir=nonredirects",
  ];

  if (apcontinue) {
    params.push("apcontinue=".concat(encodeURIComponent(apcontinue)));
  }

  return `${WIKIPEDIA_API_URL}?${params.join("&")}`;
}

async function fetchWikipediaTitles(
  targetCount: number,
  fetchFn: FetchFn,
): Promise<string[]> {
  const titles = new Set<string>();
  let apcontinue: string | undefined;

  // MediaWiki caps aplimit at 500 for regular clients.
  const pageSize = 500;

  // Loop until we have collected enough titles or the API stops returning
  // continuation tokens.
  for (;;) {
    if (titles.size >= targetCount) {
      break;
    }

    const url = buildWikipediaAllPagesUrl(apcontinue, pageSize);
    const response = await fetchFn(url);

    if (!response.ok) {
      throw new Error(
        `Wikipedia API request failed with status ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as WikipediaAllPagesResponse;

    const pages = payload.query?.allpages ?? [];

    if (!Array.isArray(pages) || pages.length === 0) {
      break;
    }

    for (const page of pages) {
      // Only index main-namespace (article) titles. Other namespaces are
      // intentionally excluded from embeddings.
      if (page.ns !== 0) {
        continue;
      }

      const title = page.title?.trim();

      if (title) {
        titles.add(title);
      }

      if (titles.size >= targetCount) {
        break;
      }
    }

    const nextToken = payload.continue?.apcontinue;

    if (!nextToken) {
      break;
    }

    apcontinue = nextToken;
  }

  return Array.from(titles);
}

type EmbeddingsRawOutput = {
  dims?: number[];
  data?: {
    length: number;
    [index: number]: number;
  };
  tolist?: () => number[][] | number[];
};

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

  throw new Error("Unexpected embeddings output format from model.");
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
          `Embeddings model returned non-finite value at [${rowIndex}, ${columnIndex}] (NaN/Infinity). Aborting backfill.`,
        );
      }
    }
  }
}

async function embedTitlesBatch(
  titles: string[],
  pipeline: EmbeddingsPipeline,
): Promise<number[][]> {
  const rawOutput = (await pipeline(titles, {
    pooling: "mean",
    normalize: true,
  })) as EmbeddingsRawOutput;

  const embeddings = extractEmbeddingsFromModelOutput(
    rawOutput,
    titles.length,
  );

  assertEmbeddingDimensions(embeddings);

  return embeddings;
}

async function getEmbeddingsPipelineOrThrow(): Promise<EmbeddingsPipeline> {
  ensureEmbeddingsPipelineInitializing();

  const existingError = getEmbeddingsPipelineError();

  if (existingError) {
    throw new Error(
      `Embeddings pipeline initialization failed: ${existingError.message}`,
    );
  }

  const initPromise = getEmbeddingsPipelineInitPromise();

  if (!isEmbeddingsPipelineReady() && initPromise) {
    try {
      await initPromise;
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      const recordedError = getEmbeddingsPipelineError() ?? normalizedError;

      throw new Error(
        `Embeddings pipeline initialization rejected: ${recordedError.message}`,
      );
    }
  }

  const finalError = getEmbeddingsPipelineError();

  if (finalError) {
    throw new Error(
      `Embeddings pipeline is not ready: ${finalError.message}`,
    );
  }

  const pipeline = getEmbeddingsPipeline();

  if (!pipeline) {
    throw new Error(
      "Embeddings pipeline is not available despite a ready status. See server logs for details.",
    );
  }

  return pipeline;
}

async function ensurePgvectorConfigured(): Promise<void> {
  const url = getPgvectorDatabaseUrl();

  if (!url) {
    throw new Error(
      "PGVECTOR_DATABASE_URL environment variable is not set. Configure it with a Postgres connection string to enable the Wikipedia embeddings backfill.",
    );
  }

  try {
    await runPgvectorQuery("SELECT 1");
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));

    throw new Error(
      `Failed to connect to pgvector Postgres database: ${normalizedError.message}`,
    );
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function backfillWikipediaTitles(): Promise<void> {
  console.log(
    "Starting Wikipedia title embeddings backfill into wikipedia_title_embeddings...",
  );

  await ensurePgvectorConfigured();

  const targetCount = getTargetTitlesCount();
  const embeddingBatchSize = getEmbeddingBatchSize();

  console.log(
    `Targeting approximately ${targetCount} English Wikipedia titles (embedding batch size: ${embeddingBatchSize}).`,
  );

  const fetchFn = getGlobalFetch();

  console.log("Fetching Wikipedia titles from the MediaWiki API...");

  const titles = await fetchWikipediaTitles(targetCount, fetchFn);

  if (!titles.length) {
    console.log("Wikipedia API returned no titles; nothing to backfill.");
    return;
  }

  console.log(
    `Fetched ${titles.length} unique Wikipedia titles. Initializing embeddings model ${MODEL_ID}...`,
  );

  const pipeline = await getEmbeddingsPipelineOrThrow();

  console.log(
    `Embeddings model ${MODEL_ID} is ready. Embedding and upserting titles into Postgres...`,
  );

  const titleBatches = chunkArray(titles, embeddingBatchSize);

  let processed = 0;

  for (const batch of titleBatches) {
    const embeddings = await embedTitlesBatch(batch, pipeline);

    if (embeddings.length !== batch.length) {
      throw new Error(
        `Embeddings batch size mismatch: expected ${batch.length}, got ${embeddings.length}.`,
      );
    }

    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let index = 0; index < batch.length; index += 1) {
      const paramOffset = index * 3;

      placeholders.push(
        `($${paramOffset + 1}, CAST($${paramOffset + 2}::double precision[] AS vector(384)), $${paramOffset + 3})`,
      );

      values.push(batch[index], embeddings[index], WIKIPEDIA_TITLES_LANG);
    }

    const sql = `
INSERT INTO wikipedia_title_embeddings (title, embedding, lang)
VALUES ${placeholders.join(", ")}
ON CONFLICT (title) DO UPDATE SET
  embedding = EXCLUDED.embedding,
  lang = EXCLUDED.lang;
` as const;

    await runPgvectorQuery(sql, values);

    processed += batch.length;

    console.log(
      `Upserted ${processed} / ${titles.length} Wikipedia titles into wikipedia_title_embeddings...`,
    );
  }

  console.log(
    `Wikipedia title embeddings backfill complete. Total rows processed: ${processed}.`,
  );
}

if (require.main === module) {
  void backfillWikipediaTitles().catch((error) => {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));

    console.error(
      "Wikipedia title embeddings backfill failed:",
      normalizedError.message,
    );
    console.error(normalizedError.stack ?? normalizedError);

    process.exitCode = 1;
  });
}

export { backfillWikipediaTitles };
