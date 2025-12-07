import { NextRequest, NextResponse } from "next/server";

import {
  MODEL_ID,
  ensureEmbeddingsPipelineInitializing,
  getEmbeddingsPipeline,
  getEmbeddingsPipelineError,
  isEmbeddingsPipelineReady,
} from "@/lib/embeddings/pipeline";
import { buildErrorResponse } from "@/lib/utils/responses";

export const runtime = "nodejs";
const MAX_INPUTS = 64;
const MAX_INPUT_LENGTH = 1024; // characters

type EmbeddingsResponseBody = {
  model: string;
  embeddings: number[][];
  dimensions: number;
};

type ErrorResponseBody = {
  error: string;
  details?: string;
  status?: "initializing";
  model?: string;
};

function parseInputs(body: unknown): string[] | ErrorResponseBody {
  if (body === null || typeof body !== "object") {
    return {
      error: "Invalid request body: expected a JSON object with an 'inputs' array.",
    };
  }

  const { inputs } = body as { inputs?: unknown };

  if (!Array.isArray(inputs)) {
    return { error: "Invalid request body: 'inputs' must be an array of strings." };
  }

  const normalized = inputs.map((item) => (typeof item === "string" ? item.trim() : item));

  if (!normalized.length) {
    return { error: "Invalid request body: 'inputs' array must not be empty." };
  }

  if (normalized.some((item) => typeof item !== "string")) {
    return { error: "Invalid request body: all 'inputs' entries must be strings." };
  }

  const nonEmptyInputs = normalized.filter((item) => item.length > 0) as string[];

  if (!nonEmptyInputs.length) {
    return { error: "Invalid request body: at least one input string must be non-empty." };
  }

  if (nonEmptyInputs.length > MAX_INPUTS) {
    return {
      error: `Invalid request body: 'inputs' must not contain more than ${MAX_INPUTS} items.`,
    };
  }

  if (nonEmptyInputs.some((item) => item.length > MAX_INPUT_LENGTH)) {
    return {
      error: `Invalid request body: each input string must be at most ${MAX_INPUT_LENGTH} characters long.`,
    };
  }

  return nonEmptyInputs;
}

export async function POST(request: NextRequest) {
  let json: unknown;

  try {
    json = await request.json();
  } catch (error) {
    return buildErrorResponse(400, {
      error: "Invalid JSON body.",
      details: error instanceof Error ? error.message : undefined,
    });
  }

  const parsedInputs = parseInputs(json);

  if (!Array.isArray(parsedInputs)) {
    return buildErrorResponse(400, parsedInputs);
  }

  // Ensure the embeddings model is initializing in the background.
  ensureEmbeddingsPipelineInitializing();

  const initError = getEmbeddingsPipelineError();

  if (initError) {
    return buildErrorResponse(500, {
      error: "Failed to initialize embeddings model.",
      details: initError.message,
    });
  }

  // If the model is still loading in the background, surface a clear
  // "initializing" status instead of forcing callers to wait for a long
  // cold-start on the first few requests.
  if (!isEmbeddingsPipelineReady()) {
    return buildErrorResponse(503, {
      error: "Embeddings model is still loading. Please try again shortly.",
      status: "initializing",
      model: MODEL_ID,
    }, {
      headers: {
        "Retry-After": "5",
      },
    });
  }

  try {
    const readyEmbeddingsPipeline = getEmbeddingsPipeline();

    if (!readyEmbeddingsPipeline) {
      // This should be impossible if isEmbeddingsPipelineReady() returned true.
      // Rely on this invariant and fail loudly in case of divergence.
      throw new Error("Embeddings pipeline missing despite ready status");
    }

    const rawOutput = (await readyEmbeddingsPipeline(parsedInputs, {
      pooling: "mean",
      normalize: true,
    })) as {
      dims?: number[];
      data?: {
        length: number;
        [index: number]: number;
      };
      tolist?: () => number[][] | number[];
    };

    let embeddings: number[][];

    if (typeof rawOutput.tolist === "function") {
      const list = rawOutput.tolist();

      if (!Array.isArray(list) || list.length === 0) {
        return buildErrorResponse(500, {
          error: "Embeddings model returned empty or invalid list output.",
        });
      }

      embeddings = Array.isArray(list[0]) ? (list as number[][]) : [list as number[]];
    } else if (rawOutput.data && Array.isArray(rawOutput.dims) && rawOutput.dims.length === 2) {
      const [batchSize, dimension] = rawOutput.dims;
      const expectedLength = batchSize * dimension;

      if (rawOutput.data.length !== expectedLength) {
        return buildErrorResponse(500, {
          error: "Embeddings model returned data with unexpected length.",
          details: `expected ${expectedLength}, got ${rawOutput.data.length}`,
        });
      }

      const flat = Array.from(rawOutput.data);
      embeddings = [];
      for (let i = 0; i < batchSize; i += 1) {
        const start = i * dimension;
        const end = start + dimension;
        embeddings.push(flat.slice(start, end));
      }
    } else {
      return buildErrorResponse(500, {
        error: "Unexpected embeddings output format from model.",
      });
    }

    if (!Array.isArray(embeddings) || embeddings.length === 0 || !embeddings[0]?.length) {
      return buildErrorResponse(500, {
        error: "Embeddings model returned empty output.",
      });
    }

    const dimensions = embeddings[0].length;

    if (!embeddings.every((row) => Array.isArray(row) && row.length === dimensions)) {
      return buildErrorResponse(500, {
        error: "Embeddings model returned rows with inconsistent dimensions.",
      });
    }

    const responseBody: EmbeddingsResponseBody = {
      model: MODEL_ID,
      embeddings,
      dimensions,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    return buildErrorResponse(500, {
      error: "Failed to generate embeddings.",
      details: error instanceof Error ? error.message : undefined,
    });
  }
}
