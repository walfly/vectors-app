import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@huggingface/transformers", () => ({
  env: {},
  pipeline: vi.fn(),
}));

type PipelineModule = typeof import("./pipeline");

async function loadPipelineModule(): Promise<PipelineModule> {
  const mod = await import("./pipeline");
  return mod as PipelineModule;
}

describe("embeddings pipeline lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("records and logs initialization failures", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const transformers = await import("@huggingface/transformers");
    const pipelineMock = transformers
      .pipeline as unknown as ReturnType<typeof vi.fn>;

    const failure = new Error("Failed to load embeddings model");

    pipelineMock.mockRejectedValueOnce(failure);

    vi.stubEnv("NODE_ENV", "test");

    const {
      ensureEmbeddingsPipelineInitializing,
      getEmbeddingsPipelineError,
      getEmbeddingsPipelineInitPromise,
      isEmbeddingsPipelineReady,
      __resetEmbeddingsPipelineStateForTests,
    } = await loadPipelineModule();

    __resetEmbeddingsPipelineStateForTests();

    ensureEmbeddingsPipelineInitializing();

    const initPromise = getEmbeddingsPipelineInitPromise();
    expect(initPromise).not.toBeNull();

    await initPromise;

    expect(isEmbeddingsPipelineReady()).toBe(false);
    expect(getEmbeddingsPipelineError()).toBe(failure);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Embeddings pipeline initialization failed",
      failure,
    );
  });

  it("throws when reset helper is used outside test environment", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { __resetEmbeddingsPipelineStateForTests } = await loadPipelineModule();

    expect(() => __resetEmbeddingsPipelineStateForTests()).toThrow(
      "__resetEmbeddingsPipelineStateForTests is test-only and must not be used in production code.",
    );
  });

  it("clears pipeline state when reset helper is used in tests", async () => {
    const transformers = await import("@huggingface/transformers");
    const pipelineMock = transformers
      .pipeline as unknown as ReturnType<typeof vi.fn>;

    const embeddingsFn = vi.fn();

    pipelineMock.mockResolvedValueOnce(embeddingsFn);

    vi.stubEnv("NODE_ENV", "test");

    const {
      ensureEmbeddingsPipelineInitializing,
      getEmbeddingsPipelineInitPromise,
      isEmbeddingsPipelineReady,
      __resetEmbeddingsPipelineStateForTests,
    } = await loadPipelineModule();

    __resetEmbeddingsPipelineStateForTests();

    ensureEmbeddingsPipelineInitializing();

    const initPromise = getEmbeddingsPipelineInitPromise();
    expect(initPromise).not.toBeNull();
    await initPromise;

    expect(isEmbeddingsPipelineReady()).toBe(true);

    __resetEmbeddingsPipelineStateForTests();

    expect(isEmbeddingsPipelineReady()).toBe(false);
  });
});
