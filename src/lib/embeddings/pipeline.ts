import { pipeline } from "@xenova/transformers";

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

export function ensureEmbeddingsPipelineInitializing() {
  if (state.pipeline || state.initPromise || state.initError) {
    return;
  }

  const initPromise = pipeline("feature-extraction", MODEL_ID)
    .then((fn) => {
      state.pipeline = fn as EmbeddingsPipeline;
    })
    .catch((error) => {
      state.initError =
        error instanceof Error ? error : new Error(String(error));
    })
    .finally(() => {
      state.initPromise = null;
    });

  state.initPromise = initPromise;
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
