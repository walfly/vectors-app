import {
  Pool,
  type QueryConfigValues,
  type QueryResult,
  type QueryResultRow,
} from "pg";

const PGVECTOR_DATABASE_URL_ENV = "PGVECTOR_DATABASE_URL" as const;

export type PgvectorPool = Pool;

type PgvectorClientState = {
  pool: PgvectorPool | null;
  initPromise: Promise<PgvectorPool> | null;
  initError: Error | null;
};

const state: PgvectorClientState = {
  pool: null,
  initPromise: null,
  initError: null,
};

export function getPgvectorDatabaseUrl(): string | null {
  const raw = process.env[PGVECTOR_DATABASE_URL_ENV];

  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function startPgvectorPoolInitialization() {
  const initPromise = (async () => {
    const url = getPgvectorDatabaseUrl();

    if (!url) {
      const error = new Error(
        `${PGVECTOR_DATABASE_URL_ENV} environment variable is not set. Configure it with a Postgres connection string to enable pgvector-backed storage.`,
      );

      state.initError = error;

      console.error("PGVector database URL is not configured", error);

      throw error;
    }

    const pool = new Pool({ connectionString: url });

    pool.on("error", (poolError: unknown) => {
      console.error("PGVector Postgres pool error", poolError);
    });

    try {
      // Lightweight connectivity check so callers fail fast on bad URLs.
      await pool.query("SELECT 1");
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      state.initError = normalizedError;

      console.error(
        "Failed to initialize PGVector Postgres connection pool",
        normalizedError,
      );

      // Best-effort cleanup; ignore failures but log them.
      try {
        await pool.end();
      } catch (endError) {
        console.error(
          "Failed to clean up PGVector Postgres pool after initialization error",
          endError instanceof Error
            ? endError
            : new Error(String(endError)),
        );
      }

      throw normalizedError;
    }

    state.pool = pool;
    state.initError = null;

    return pool;
  })().finally(() => {
    state.initPromise = null;
  });

  state.initPromise = initPromise;
}

export async function getPgvectorPool(): Promise<PgvectorPool> {
  if (state.pool) {
    return state.pool;
  }

  if (!state.initPromise) {
    startPgvectorPoolInitialization();
  }

  const { initPromise } = state;

  if (!initPromise) {
    throw new Error(
      "PGVector Postgres pool initialization failed to start. See server logs for details.",
    );
  }

  return initPromise;
}

export async function runPgvectorQuery<
  TRow extends QueryResultRow = QueryResultRow,
  TParams extends unknown[] = unknown[],
>(
  text: string,
  values?: QueryConfigValues<TParams>,
): Promise<QueryResult<TRow>> {
  const pool = await getPgvectorPool();

  try {
    return await pool.query<TRow>(text, values);
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));

    console.error("PGVector Postgres query error", normalizedError);

    throw normalizedError;
  }
}

export type PgvectorDbStatus = {
  urlConfigured: boolean;
  connected: boolean;
  lastError: Error | null;
};

export function getPgvectorDbStatus(): PgvectorDbStatus {
  return {
    urlConfigured: getPgvectorDatabaseUrl() !== null,
    connected: state.pool !== null,
    lastError: state.initError,
  };
}

function resetPgvectorClientState() {
  const existingPool = state.pool;

  state.pool = null;
  state.initPromise = null;
  state.initError = null;

  if (existingPool) {
    // Best-effort, fire-and-forget cleanup in tests; log but ignore errors.
    void existingPool
      .end()
      .catch((endError) => {
        console.error(
          "Failed to clean up PGVector Postgres pool during test reset",
          endError instanceof Error
            ? endError
            : new Error(String(endError)),
        );
      });
  }
}

/**
* Test-only helper to clear the pgvector Postgres client singleton state.
*
* Not intended for use in production code. This function will throw
* whenever `process.env.NODE_ENV` is set to a non-`"test"` value
* (for example, `"production"` or `"staging"`).
*/
export function __resetPgvectorClientStateForTests() {
  const env = process.env.NODE_ENV;

  if (env && env !== "test") {
    throw new Error(
      "__resetPgvectorClientStateForTests is test-only and must not be used in production code.",
    );
  }

  resetPgvectorClientState();
}
