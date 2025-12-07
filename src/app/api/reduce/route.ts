import { NextRequest, NextResponse } from "next/server";

import { reduceWithPCA, reduceWithUMAP } from "../../../lib/vectors";
import { buildErrorResponse } from "../../../lib/utils/responses";

export const runtime = "nodejs";

type ReductionMethod = "pca" | "umap";

type ReductionResponseBody = {
  points: number[][];
  method: ReductionMethod;
};

type ErrorResponseBody = {
  error: string;
};

type ParsedReductionRequest = {
  vectors: number[][];
  method: ReductionMethod;
  dimensions: 2 | 3;
};

type RawReductionRequest = {
  vectors?: unknown;
  method?: unknown;
  dimensions?: unknown;
};

function parseReductionRequest(body: unknown):
  | ParsedReductionRequest
  | ErrorResponseBody {
  if (body === null || typeof body !== "object") {
    return {
      error:
        "Invalid request body: expected a JSON object with 'vectors', and optional 'method' and 'dimensions' fields.",
    };
  }

  const { vectors, method, dimensions } = body as RawReductionRequest;

  if (!Array.isArray(vectors)) {
    return {
      error:
        "Invalid request body: 'vectors' must be a non-empty array of numeric vectors.",
    };
  }

  if (vectors.length === 0) {
    return {
      error:
        "Invalid request body: 'vectors' array must contain at least one vector.",
    };
  }

  const matrix: number[][] = [];
  let dimension: number | null = null;

  for (let i = 0; i < vectors.length; i += 1) {
    const row = vectors[i];

    if (!Array.isArray(row)) {
      return {
        error: `Invalid request body: 'vectors[${i}]' must be an array of numbers.`,
      };
    }

    if (row.length === 0) {
      return {
        error: `Invalid request body: 'vectors[${i}]' must not be empty.`,
      };
    }

    if (dimension === null) {
      dimension = row.length;
    } else if (row.length !== dimension) {
      return {
        error:
          "Invalid request body: all vectors must have the same length (input dimension).",
      };
    }

    const numericRow = new Array<number>(row.length);

    for (let j = 0; j < row.length; j += 1) {
      const value = row[j];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        return {
          error: `Invalid request body: 'vectors[${i}][${j}]' must be a finite number. Received ${String(
            value,
          )}.`,
        };
      }

      numericRow[j] = value;
    }

    matrix.push(numericRow);
  }

  const methodValue: ReductionMethod =
    method === undefined ? "pca" : (method as ReductionMethod);

  if (methodValue !== "pca" && methodValue !== "umap") {
    return {
      error:
        "Invalid request body: 'method' must be either 'pca' or 'umap' if provided.",
    };
  }

  let dimensionsValue: 2 | 3;

  if (dimensions === undefined) {
    dimensionsValue = 3;
  } else if (dimensions === 2 || dimensions === 3) {
    dimensionsValue = dimensions;
  } else {
    return {
      error:
        "Invalid request body: 'dimensions' must be either 2 or 3 if provided.",
    };
  }

  const inputDimension = dimension as number;

  if (dimensionsValue > inputDimension) {
    return {
      error: `Invalid request body: 'dimensions' (${dimensionsValue}) cannot be greater than the input vector dimension (${inputDimension}).`,
    };
  }

  return {
    vectors: matrix,
    method: methodValue,
    dimensions: dimensionsValue,
  };
}

export async function POST(request: NextRequest) {
  let json: unknown;

  try {
    json = await request.json();
  } catch {
    return buildErrorResponse(400, {
      error: "Invalid JSON body.",
    });
  }

  const parsed = parseReductionRequest(json);

  if ("error" in parsed) {
    return buildErrorResponse(400, parsed);
  }

  const { vectors, method, dimensions } = parsed;

  try {
    const points =
      method === "pca"
        ? reduceWithPCA(vectors, dimensions)
        : reduceWithUMAP(vectors, dimensions);

    const responseBody: ReductionResponseBody = {
      points,
      method,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while reducing vectors.";

    // Treat known validation-style errors from the underlying math helpers
    // as client errors; everything else is surfaced as a server error.
    const isClientError =
      error instanceof TypeError || error instanceof RangeError;

    return buildErrorResponse(isClientError ? 400 : 500, {
      error: message,
    });
  }
}
