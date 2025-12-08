import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PoolInstance = {
  query: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

const poolInstances: PoolInstance[] = [];

const PoolConstructorMock = vi.fn(function () {
  const instance: PoolInstance = {
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };

  poolInstances.push(instance);

  return instance;
});

vi.mock("pg", () => ({
  Pool: PoolConstructorMock,
}));

type PgvectorModule = typeof import("./pgvector");

async function loadPgvectorModule(): Promise<PgvectorModule> {
  const mod = await import("./pgvector");
  return mod as PgvectorModule;
}

describe("pgvector Postgres client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolInstances.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("surfaces a clear error when PGVECTOR_DATABASE_URL is missing", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const {
      getPgvectorPool,
      getPgvectorDbStatus,
      __resetPgvectorClientStateForTests,
    } = await loadPgvectorModule();

    __resetPgvectorClientStateForTests();

    await expect(getPgvectorPool()).rejects.toThrow(
      "PGVECTOR_DATABASE_URL environment variable is not set",
    );

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [message, error] = consoleErrorSpy.mock.calls[0] ?? [];
    expect(message).toBe("PGVector database URL is not configured");
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "PGVECTOR_DATABASE_URL environment variable is not set",
    );

    const status = getPgvectorDbStatus();
    expect(status.urlConfigured).toBe(false);
    expect(status.connected).toBe(false);
    expect(status.lastError).toBeInstanceOf(Error);
  });

  it("initializes a pool lazily and reuses it for queries", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PGVECTOR_DATABASE_URL", "postgres://user:pass@localhost:5432/db");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const {
      getPgvectorPool,
      getPgvectorDbStatus,
      runPgvectorQuery,
      __resetPgvectorClientStateForTests,
    } = await loadPgvectorModule();

    __resetPgvectorClientStateForTests();

    const pool = await getPgvectorPool();

    expect(poolInstances).toHaveLength(1);
    const instance = poolInstances[0];

    expect(PoolConstructorMock).toHaveBeenCalledTimes(1);
    expect(instance.query).toHaveBeenCalled();
    expect(pool).toBe(instance);

    const statusAfterInit = getPgvectorDbStatus();
    expect(statusAfterInit.urlConfigured).toBe(true);
    expect(statusAfterInit.connected).toBe(true);
    expect(statusAfterInit.lastError).toBeNull();

    instance.query.mockResolvedValueOnce({
      rows: [{ id: 1 }],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as never);

    const result = await runPgvectorQuery<{ id: number }>(
      "SELECT id FROM items WHERE id = $1",
      [1],
    );

    expect(result.rows[0]?.id).toBe(1);
    expect(instance.query).toHaveBeenCalledTimes(2);
    expect(poolInstances).toHaveLength(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("ends an existing pool when resetting client state in tests", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PGVECTOR_DATABASE_URL", "postgres://user:pass@localhost:5432/db");

    const {
      getPgvectorPool,
      __resetPgvectorClientStateForTests,
    } = await loadPgvectorModule();

    // First reset: should be a no-op for pool instances.
    __resetPgvectorClientStateForTests();

    expect(poolInstances).toHaveLength(0);

    const pool = await getPgvectorPool();

    expect(poolInstances).toHaveLength(1);
    const instance = poolInstances[0];

    expect(pool).toBe(instance);
    expect(instance.end).not.toHaveBeenCalled();

    __resetPgvectorClientStateForTests();

    expect(poolInstances).toHaveLength(1);
    expect(instance.end).toHaveBeenCalledTimes(1);
  });

  it("logs and ignores errors when pool end fails during test reset", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PGVECTOR_DATABASE_URL", "postgres://user:pass@localhost:5432/db");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const {
      getPgvectorPool,
      __resetPgvectorClientStateForTests,
    } = await loadPgvectorModule();

    const pool = await getPgvectorPool();

    expect(poolInstances).toHaveLength(1);
    const instance = poolInstances[0];

    const endError = new Error("end failed");
    instance.end.mockRejectedValueOnce(endError);

    __resetPgvectorClientStateForTests();

    // Allow the rejection handler to run.
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to clean up PGVector Postgres pool during test reset",
      endError,
    );
  });

  it("records and logs initialization failures when connectivity check fails", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PGVECTOR_DATABASE_URL", "postgres://user:pass@localhost:5432/db");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const {
      getPgvectorPool,
      getPgvectorDbStatus,
      __resetPgvectorClientStateForTests,
    } = await loadPgvectorModule();

    __resetPgvectorClientStateForTests();

    const failure = new Error("connection refused");

    PoolConstructorMock.mockImplementationOnce(function () {
      const instance: PoolInstance = {
        query: vi.fn().mockRejectedValueOnce(failure),
        end: vi.fn().mockResolvedValueOnce(undefined),
        on: vi.fn(),
      };

      poolInstances.push(instance);

      return instance;
    });

    await expect(getPgvectorPool()).rejects.toBe(failure);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to initialize PGVector Postgres connection pool",
      failure,
    );

    const status = getPgvectorDbStatus();
    expect(status.urlConfigured).toBe(true);
    expect(status.connected).toBe(false);
    expect(status.lastError).toBe(failure);

    const instance = poolInstances[0];
    expect(instance.end).toHaveBeenCalledTimes(1);
  });

  it("throws when reset helper is used outside the test environment", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { __resetPgvectorClientStateForTests } = await loadPgvectorModule();

    expect(() => __resetPgvectorClientStateForTests()).toThrow(
      "__resetPgvectorClientStateForTests is test-only and must not be used in production code.",
    );
  });
});
