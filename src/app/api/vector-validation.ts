import type { Vector } from "../../lib/vectors";

export type ValidationErrorBody = {
  error: string;
};

export function validateNumericVectorEntries(
  pathPrefix: string,
  vector: unknown[],
): Vector | ValidationErrorBody {
  for (let j = 0; j < vector.length; j += 1) {
    const value = vector[j];

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return {
        error:
          "Invalid request body: '" +
          pathPrefix +
          "[" +
          j +
          "]' must be a finite number.",
      };
    }
  }

  return vector as Vector;
}

export type LabeledVector = {
  id: string;
  vector: Vector;
};

type CandidateListOptions = {
  fieldName: string;
  nonArrayMessage: string;
  emptyArrayMessage: string;
  dimension?: number;
  dimensionMismatchMessage: string;
};

export function parseLabeledVectorCandidates(
  rawCandidates: unknown,
  options: CandidateListOptions,
): { candidates: LabeledVector[] } | ValidationErrorBody {
  const {
    fieldName,
    nonArrayMessage,
    emptyArrayMessage,
    dimension,
    dimensionMismatchMessage,
  } = options;

  if (!Array.isArray(rawCandidates)) {
    return { error: nonArrayMessage };
  }

  if (rawCandidates.length === 0) {
    return { error: emptyArrayMessage };
  }

  const parsed: LabeledVector[] = [];

  for (let i = 0; i < rawCandidates.length; i += 1) {
    const candidate = rawCandidates[i];

    if (candidate === null || typeof candidate !== "object") {
      return {
        error:
          "Invalid request body: '" +
          fieldName +
          "[" +
          i +
          "]' must be an object with 'id' and 'vector' properties.",
      };
    }

    const { id, vector } = candidate as { id?: unknown; vector?: unknown };

    if (typeof id !== "string" || id.length === 0) {
      return {
        error:
          "Invalid request body: '" +
          fieldName +
          "[" +
          i +
          "].id' must be a non-empty string.",
      };
    }

    if (!Array.isArray(vector)) {
      return {
        error:
          "Invalid request body: '" +
          fieldName +
          "[" +
          i +
          "].vector' must be an array of numbers.",
      };
    }

    if (vector.length === 0) {
      return {
        error:
          "Invalid request body: '" +
          fieldName +
          "[" +
          i +
          "].vector' must not be empty.",
      };
    }

    if (dimension !== undefined && vector.length !== dimension) {
      return { error: dimensionMismatchMessage };
    }

    const numericVector = validateNumericVectorEntries(
      fieldName + "[" + i + "].vector",
      vector,
    );

    if ("error" in numericVector) {
      return numericVector;
    }

    parsed.push({ id, vector: numericVector });
  }

  return { candidates: parsed };
}
