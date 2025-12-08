import { NextRequest, NextResponse } from "next/server";

import type { Vector } from "../../../lib/vectors";
import {
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
} from "../../../lib/vectors";
import { buildErrorResponse } from "../../../lib/utils/responses";

export const runtime = "edge";

type SimilarityMetric = "cosine" | "euclidean" | "dot";

type SimilarityResponseBody = {
  metric: SimilarityMetric;
  matrix: number[][];
};

type ErrorResponseBody = {
  error: string;
};

type RawSimilarityRequest = {
  vectors?: unknown;
  metric?: unknown;
};

type ParsedSimilarityRequest = {
  vectors: Vector[];
  metric: SimilarityMetric;
};

function parseSimilarityRequest(body: unknown):
  | ParsedSimilarityRequest
  | ErrorResponseBody {
  if (body === null || typeof body !== "object") {
    return {
      error:
        "Invalid request body: expected a JSON object with 'vectors' and optional 'metric' field.",
    };
  }

  const { vectors, metric } = body as RawSimilarityRequest;

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

  const matrix: Vector[] = [];
  const firstRow = vectors[0];

  if (!Array.isArray(firstRow)) {
    return {
      error:
        "Invalid request body: 'vectors[0]' must be an array of numbers.",
    };
  }

  if (firstRow.length === 0) {
    return {
      error: "Invalid request body: 'vectors[0]' must not be empty.",
    };
  }

  const inputDimension = firstRow.length;

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

    if (row.length !== inputDimension) {
      return {
        error:
          "Invalid request body: all vectors must have the same length (input dimension).",
      };
    }

    for (let j = 0; j < row.length; j += 1) {
      const value = row[j];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        return {
          error: `Invalid request body: 'vectors[${i}][${j}]' must be a finite number.`,
        };
      }
    }

    matrix.push(row as Vector);
  }

  const metricValue: SimilarityMetric =
    metric === undefined ? "cosine" : (metric as SimilarityMetric);

  if (metricValue !== "cosine" && metricValue !== "euclidean" && metricValue !== "dot") {
    return {
      error:
        "Invalid request body: 'metric' must be one of 'cosine', 'euclidean', or 'dot' if provided.",
    };
  }

  return {
    vectors: matrix,
    metric: metricValue,
  };
}

function computePairwiseMetric(
  vectors: Vector[],
  metric: SimilarityMetric,
): number[][] {
  const size = vectors.length;
  const matrix = new Array<number[]>(size);

  for (let i = 0; i < size; i += 1) {
    const row = new Array<number>(size);

    for (let j = 0; j < size; j += 1) {
      const a = vectors[i];
      const b = vectors[j];

      let value: number;

      if (metric === "cosine") {
        value = cosineSimilarity(a, b);
      } else if (metric === "euclidean") {
        value = euclideanDistance(a, b);
      } else {
        value = dotProduct(a, b);
      }

      row[j] = value;
    }

    matrix[i] = row;
  }

  return matrix;
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

  const parsed = parseSimilarityRequest(json);

  if ("error" in parsed) {
    return buildErrorResponse(400, parsed);
  }

  const { vectors, metric } = parsed;

  try {
    const matrix = computePairwiseMetric(vectors, metric);

    const responseBody: SimilarityResponseBody = {
      metric,
      matrix,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while computing similarity matrix.";

    const isClientError =
      error instanceof TypeError || error instanceof RangeError;

    return buildErrorResponse(isClientError ? 400 : 500, {
      error: message,
    });
  }
}
