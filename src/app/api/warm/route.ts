import { NextResponse } from "next/server";

import {
  MODEL_ID,
  ensureEmbeddingsPipelineInitializing,
  getEmbeddingsPipelineError,
  getEmbeddingsPipelineInitPromise,
  isEmbeddingsPipelineReady,
} from "../../../lib/embeddings/pipeline";

export const runtime = "nodejs";

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
    } catch {
      // Swallow any unexpected rejections; the shared pipeline module
      // records initialization failures via getEmbeddingsPipelineError().
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
