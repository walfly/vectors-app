export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export type EmbeddingsPipeline = (
  inputs: string[],
  options?: { pooling?: string; normalize?: boolean },
) => Promise<unknown>;

type EmbeddingsPipelineState = {
  pipeline: EmbeddingsPipeline | null;
  initPromise: Promise<void> | null;
  initError: Error | null;
};

const state: EmbeddingsPipelineState = {
  pipeline: null,
  initPromise: null,
  initError: null,
};

function startEmbeddingsPipelineInitialization() {
  const initPromise = import("@xenova/transformers")
    .then((mod) => mod.pipeline("feature-extraction", MODEL_ID))
    .then((fn) => {
      state.pipeline = fn as EmbeddingsPipeline;
    })
    .catch((error) => {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      state.initError = normalizedError;

      // Log initialization failures at the source so they are visible
      // even if callers only inspect aggregated status.
      console.error(
        "Embeddings pipeline initialization failed",
        normalizedError,
      );
    })
    .finally(() => {
      state.initPromise = null;
    });

  state.initPromise = initPromise;
}

function resetEmbeddingsPipelineState() {
  state.pipeline = null;
  state.initPromise = null;
  state.initError = null;
}

export function ensureEmbeddingsPipelineInitializing() {
  if (state.pipeline || state.initPromise || state.initError) {
    return;
  }

  startEmbeddingsPipelineInitialization();
}

/**
* Force a fresh initialization attempt for the embeddings pipeline.
*
* This clears any existing pipeline instance, in-flight initialization
* promise, and previous initialization error before starting a new
* initialization.
*/
export function restartEmbeddingsPipeline() {
  resetEmbeddingsPipelineState();
  startEmbeddingsPipelineInitialization();
}

/**
* Test-only helper to clear the embeddings pipeline singleton state.
*
* Not intended for use in production code. This function will throw
* whenever `process.env.NODE_ENV` is set to a non-`"test"` value
* (for example, `"production"` or `"staging"`).
*/
export function __resetEmbeddingsPipelineStateForTests() {
  const env = process.env.NODE_ENV;
  if (env && env !== "test") {
    throw new Error(
      "__resetEmbeddingsPipelineStateForTests is test-only and must not be used in production code.",
    );
  }

  resetEmbeddingsPipelineState();
}

export function isEmbeddingsPipelineReady(): boolean {
  return state.pipeline !== null;
}

export function getEmbeddingsPipeline(): EmbeddingsPipeline | null {
  return state.pipeline;
}

export function getEmbeddingsPipelineError(): Error | null {
  return state.initError;
}

export function getEmbeddingsPipelineInitPromise(): Promise<void> | null {
  return state.initPromise;
}

export type EmbeddingsModelStatus = {
  modelName: string;
  modelLoaded: boolean;
  initializing: boolean;
  error: Error | null;
};

export function getEmbeddingsModelStatus(): EmbeddingsModelStatus {
  const modelLoaded = isEmbeddingsPipelineReady();

  return {
    modelName: MODEL_ID,
    modelLoaded,
    initializing: !modelLoaded && state.initPromise !== null,
    error: state.initError,
  };
}
