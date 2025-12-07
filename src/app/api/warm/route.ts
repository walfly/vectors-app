import { NextResponse } from "next/server";

import {
  MODEL_ID,
  ensureEmbeddingsPipelineInitializing,
  getEmbeddingsPipelineError,
  getEmbeddingsPipelineInitPromise,
  isEmbeddingsPipelineReady,
} from "../../../lib/embeddings/pipeline";

export const runtime = "edge";

type WarmResponseBody = {
  warmed: boolean;
  modelName: string;
  status: "initializing" | "ready" | "error";
  error?: string;
};

export async function GET() {
  ensureEmbeddingsPipelineInitializing();

  const existingError = getEmbeddingsPipelineError();

  if (existingError) {
    const body: WarmResponseBody = {
      warmed: false,
      modelName: MODEL_ID,
      status: "error",
      error: existingError.message,
    };

    return NextResponse.json(body, { status: 500 });
  }

  const initPromise = getEmbeddingsPipelineInitPromise();

  if (!isEmbeddingsPipelineReady() && initPromise) {
    try {
      await initPromise;
    } catch (error) {
      // Surface unexpected initialization rejections to logs so that
      // warm-up failures are debuggable even if the shared pipeline
      // module does not record an initError for some reason.
      //
      // Next.js logs server-side console output, which is appropriate
      // for this low-frequency warm-up endpoint.
      console.error("Embeddings warm-up initialization rejected", error);

      const recordedError = getEmbeddingsPipelineError();

      const body: WarmResponseBody = {
        warmed: false,
        modelName: MODEL_ID,
        status: "error",
        error:
          recordedError?.message ??
          "Embeddings initialization failed; see server logs for details.",
      };

      return NextResponse.json(body, { status: 500 });
    }
  }

  const error = getEmbeddingsPipelineError();
  const warmed = isEmbeddingsPipelineReady();

  if (error) {
    const body: WarmResponseBody = {
      warmed: false,
      modelName: MODEL_ID,
      status: "error",
      error: error.message,
    };

    return NextResponse.json(body, { status: 500 });
  }

  const body: WarmResponseBody = {
    warmed,
    modelName: MODEL_ID,
    status: warmed ? "ready" : "initializing",
  };

  return NextResponse.json(body, { status: 200 });
}
