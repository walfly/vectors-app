import { NextRequest, NextResponse } from "next/server";

import type { Vector } from "../../../lib/vectors";
import {
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
} from "../../../lib/vectors";
import { buildErrorResponse } from "../../../lib/utils/responses";

export const runtime = "edge";

type NearestMetric = "cosine" | "euclidean" | "dot";

type NearestNeighbor = {
  id: string;
  score: number;
};

type NearestResponseBody = {
  metric: NearestMetric;
  neighbors: NearestNeighbor[];
};

type ErrorResponseBody = {
  error: string;
};

type RawNearestCandidate = {
  id?: unknown;
  vector?: unknown;
};

type ParsedNearestCandidate = {
  id: string;
  vector: Vector;
};

type RawNearestRequest = {
  query?: unknown;
  candidates?: unknown;
  k?: unknown;
  metric?: unknown;
};

type ParsedNearestRequest = {
  query: Vector;
  candidates: ParsedNearestCandidate[];
  k: number;
  metric: NearestMetric;
};

const DEFAULT_K = 10;

function parseNearestRequest(body: unknown): ParsedNearestRequest | ErrorResponseBody {
  if (body === null || typeof body !== "object") {
    return {
      error:
        "Invalid request body: expected a JSON object with 'query', 'candidates', and optional 'k' and 'metric' fields.",
    };
  }

  const { query, candidates, k, metric } = body as RawNearestRequest;

  if (!Array.isArray(query)) {
    return {
      error:
        "Invalid request body: 'query' must be a non-empty array of numbers representing a vector.",
    };
  }

  if (query.length === 0) {
    return {
      error: "Invalid request body: 'query' vector must not be empty.",
    };
  }

  for (let i = 0; i < query.length; i += 1) {
    const value = query[i];

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return {
        error: `Invalid request body: 'query[${i}]' must be a finite number.`,
      };
    }
  }

  if (!Array.isArray(candidates)) {
    return {
      error:
        "Invalid request body: 'candidates' must be a non-empty array of objects with 'id' and 'vector' properties.",
    };
  }

  if (candidates.length === 0) {
    return {
      error:
        "Invalid request body: 'candidates' array must contain at least one candidate.",
    };
  }

  const queryDimension = query.length;
  const parsedCandidates: ParsedNearestCandidate[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];

    if (candidate === null || typeof candidate !== "object") {
      return {
        error:
          "Invalid request body: 'candidates[" +
          i +
          "]' must be an object with 'id' and 'vector' properties.",
      };
    }

    const { id, vector } = candidate as RawNearestCandidate;

    if (typeof id !== "string" || id.length === 0) {
      return {
        error:
          "Invalid request body: 'candidates[" +
          i +
          "].id' must be a non-empty string.",
      };
    }

    if (!Array.isArray(vector)) {
      return {
        error:
          "Invalid request body: 'candidates[" +
          i +
          "].vector' must be an array of numbers.",
      };
    }

    if (vector.length === 0) {
      return {
        error:
          "Invalid request body: 'candidates[" +
          i +
          "].vector' must not be empty.",
      };
    }

    if (vector.length !== queryDimension) {
      return {
        error:
          "Invalid request body: all candidate vectors must have the same length as the query vector.",
      };
    }

    for (let j = 0; j < vector.length; j += 1) {
      const value = vector[j];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        return {
          error:
            "Invalid request body: 'candidates[" +
            i +
            "].vector[" +
            j +
            "]' must be a finite number.",
        };
      }
    }

    parsedCandidates.push({ id, vector: vector as Vector });
  }

  let kValue: number;

  if (k === undefined) {
    kValue = DEFAULT_K;
  } else if (typeof k !== "number" || !Number.isInteger(k) || k <= 0) {
    return {
      error:
        "Invalid request body: 'k' must be a positive integer when provided.",
    };
  } else {
    kValue = k;
  }

  const metricValue: NearestMetric =
    metric === undefined ? "cosine" : (metric as NearestMetric);

  if (metricValue !== "cosine" && metricValue !== "euclidean" && metricValue !== "dot") {
    return {
      error:
        "Invalid request body: 'metric' must be one of 'cosine', 'euclidean', or 'dot' if provided.",
    };
  }

  return {
    query: query as Vector,
    candidates: parsedCandidates,
    k: kValue,
    metric: metricValue,
  };
}

function computeScore(a: Vector, b: Vector, metric: NearestMetric): number {
  if (metric === "cosine") {
    return cosineSimilarity(a, b);
  }

  if (metric === "euclidean") {
    return euclideanDistance(a, b);
  }

  return dotProduct(a, b);
}

function findNearestNeighbors(
  query: Vector,
  candidates: ParsedNearestCandidate[],
  k: number,
  metric: NearestMetric,
): NearestNeighbor[] {
  const scored: NearestNeighbor[] = candidates.map((candidate) => ({
    id: candidate.id,
    score: computeScore(query, candidate.vector, metric),
  }));

  scored.sort((a, b) => {
    if (metric === "euclidean") {
      return a.score - b.score; // smaller distance is better
    }

    return b.score - a.score; // larger similarity is better
  });

  const limit = Math.min(k, scored.length);
  return scored.slice(0, limit);
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

  const parsed = parseNearestRequest(json);

  if ("error" in parsed) {
    return buildErrorResponse(400, parsed);
  }

  const { query, candidates, k, metric } = parsed;

  try {
    const neighbors = findNearestNeighbors(query, candidates, k, metric);

    const responseBody: NearestResponseBody = {
      metric,
      neighbors,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while computing nearest neighbors.";

    const isClientError =
      error instanceof TypeError || error instanceof RangeError;

    return buildErrorResponse(isClientError ? 400 : 500, {
      error: message,
    });
  }
}
