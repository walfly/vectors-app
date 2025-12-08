import { NextRequest, NextResponse } from "next/server";

import type { Vector } from "../../../lib/vectors";
import {
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
} from "../../../lib/vectors";
import { buildErrorResponse } from "../../../lib/utils/responses";

export const runtime = "edge";

type ArithmeticMetric = "cosine" | "euclidean" | "dot";

type ArithmeticTerm = {
  id: string;
  vector: Vector;
  weight: number;
};

type ArithmeticCandidate = {
  id: string;
  vector: Vector;
};

type NearestNeighbor = {
  id: string;
  score: number;
};

type ArithmeticResponseBody = {
  result: number[];
  metric: ArithmeticMetric;
  neighbors?: NearestNeighbor[];
};

type ErrorResponseBody = {
  error: string;
};

type RawArithmeticTerm = {
  id?: unknown;
  vector?: unknown;
  weight?: unknown;
};

type RawArithmeticCandidate = {
  id?: unknown;
  vector?: unknown;
};

type RawArithmeticRequest = {
  terms?: unknown;
  candidates?: unknown;
  k?: unknown;
  metric?: unknown;
};

type ParsedArithmeticRequest = {
  terms: ArithmeticTerm[];
  candidates?: ArithmeticCandidate[];
  k?: number;
  metric: ArithmeticMetric;
};

const DEFAULT_K = 10;

function parseArithmeticRequest(body: unknown):
  | ParsedArithmeticRequest
  | ErrorResponseBody {
  if (body === null || typeof body !== "object") {
    return {
      error:
        "Invalid request body: expected a JSON object with 'terms' and optional 'candidates', 'k', and 'metric' fields.",
    };
  }

  const { terms, candidates, k, metric } = body as RawArithmeticRequest;

  if (!Array.isArray(terms)) {
    return {
      error:
        "Invalid request body: 'terms' must be a non-empty array of { id, vector, weight } objects.",
    };
  }

  if (terms.length === 0) {
    return {
      error:
        "Invalid request body: 'terms' array must contain at least one term.",
    };
  }

  const parsedTerms: ArithmeticTerm[] = [];
  let dimension: number | null = null;

  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i];

    if (term === null || typeof term !== "object") {
      return {
        error:
          "Invalid request body: 'terms[" +
          i +
          "]' must be an object with 'id', 'vector', and 'weight' properties.",
      };
    }

    const { id, vector, weight } = term as RawArithmeticTerm;

    if (typeof id !== "string" || id.length === 0) {
      return {
        error:
          "Invalid request body: 'terms[" +
          i +
          "].id' must be a non-empty string.",
      };
    }

    if (!Array.isArray(vector)) {
      return {
        error:
          "Invalid request body: 'terms[" +
          i +
          "].vector' must be an array of numbers.",
      };
    }

    if (vector.length === 0) {
      return {
        error:
          "Invalid request body: 'terms[" +
          i +
          "].vector' must not be empty.",
      };
    }

    if (typeof weight !== "number" || !Number.isFinite(weight)) {
      return {
        error:
          "Invalid request body: 'terms[" +
          i +
          "].weight' must be a finite number.",
      };
    }

    if (dimension === null) {
      dimension = vector.length;
    } else if (vector.length !== dimension) {
      return {
        error:
          "Invalid request body: all term vectors must have the same length.",
      };
    }

    for (let j = 0; j < vector.length; j += 1) {
      const value = vector[j];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        return {
          error:
            "Invalid request body: 'terms[" +
            i +
            "].vector[" +
            j +
            "]' must be a finite number.",
        };
      }
    }

    parsedTerms.push({ id, vector: vector as Vector, weight });
  }

  let parsedCandidates: ArithmeticCandidate[] | undefined;

  if (candidates !== undefined) {
    if (!Array.isArray(candidates)) {
      return {
        error:
          "Invalid request body: 'candidates' must be a non-empty array of { id, vector } objects when provided.",
      };
    }

    if (candidates.length === 0) {
      return {
        error:
          "Invalid request body: 'candidates' array must contain at least one candidate when provided.",
      };
    }

    parsedCandidates = [];

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

      const { id, vector } = candidate as RawArithmeticCandidate;

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

      if (dimension !== null && vector.length !== dimension) {
        return {
          error:
            "Invalid request body: all candidate vectors must have the same length as the term vectors.",
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
  }

  let kValue: number | undefined;

  if (parsedCandidates && parsedCandidates.length > 0) {
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
  } else if (k !== undefined) {
    return {
      error:
        "Invalid request body: 'k' can only be provided when 'candidates' is present and non-empty.",
    };
  }

  const metricValue: ArithmeticMetric =
    metric === undefined ? "cosine" : (metric as ArithmeticMetric);

  if (metricValue !== "cosine" && metricValue !== "euclidean" && metricValue !== "dot") {
    return {
      error:
        "Invalid request body: 'metric' must be one of 'cosine', 'euclidean', or 'dot' if provided.",
    };
  }

  return {
    terms: parsedTerms,
    candidates: parsedCandidates,
    k: kValue,
    metric: metricValue,
  };
}

function computeWeightedSum(terms: ArithmeticTerm[]): Vector {
  if (terms.length === 0) {
    throw new RangeError("computeWeightedSum requires at least one term.");
  }

  const dimension = terms[0].vector.length;
  const result = new Array<number>(dimension).fill(0);

  for (let i = 0; i < terms.length; i += 1) {
    const { vector, weight } = terms[i];

    for (let j = 0; j < dimension; j += 1) {
      result[j] += vector[j] * weight;
    }
  }

  return result;
}

function computeScore(
  a: Vector,
  b: Vector,
  metric: ArithmeticMetric,
): number {
  if (metric === "cosine") {
    return cosineSimilarity(a, b);
  }

  if (metric === "euclidean") {
    return euclideanDistance(a, b);
  }

  return dotProduct(a, b);
}

function findNearestNeighborsForResult(
  result: Vector,
  candidates: ArithmeticCandidate[],
  k: number | undefined,
  metric: ArithmeticMetric,
): NearestNeighbor[] {
  if (!candidates.length) {
    return [];
  }

  const kValue = k ?? DEFAULT_K;

  const scored: NearestNeighbor[] = candidates.map((candidate) => ({
    id: candidate.id,
    score: computeScore(result, candidate.vector, metric),
  }));

  scored.sort((a, b) => {
    if (metric === "euclidean") {
      return a.score - b.score;
    }

    return b.score - a.score;
  });

  const limit = Math.min(kValue, scored.length);
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

  const parsed = parseArithmeticRequest(json);

  if ("error" in parsed) {
    return buildErrorResponse(400, parsed);
  }

  const { terms, candidates, k, metric } = parsed;

  try {
    const result = computeWeightedSum(terms);

    const neighbors =
      candidates && candidates.length > 0
        ? findNearestNeighborsForResult(result, candidates, k, metric)
        : undefined;

    const responseBody: ArithmeticResponseBody =
      neighbors && neighbors.length > 0
        ? { result, metric, neighbors }
        : { result, metric };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while performing vector arithmetic.";

    const isClientError =
      error instanceof TypeError || error instanceof RangeError;

    return buildErrorResponse(isClientError ? 400 : 500, {
      error: message,
    });
  }
}
