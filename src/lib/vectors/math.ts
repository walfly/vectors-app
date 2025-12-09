export type Vector = number[];

function assertVector(vector: Vector, fnName: string, paramName: string) {
  if (!Array.isArray(vector)) {
    throw new TypeError(
      `${fnName}: expected '${paramName}' to be an array of numbers.`,
    );
  }

  if (vector.length === 0) {
    throw new Error(
      `${fnName}: expected '${paramName}' to contain at least one element.`,
    );
  }

  for (let i = 0; i < vector.length; i += 1) {
    const value = vector[i];

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(
        `${fnName}: '${paramName}[${i}]' must be a finite number. Received ${String(
          value,
        )}.`,
      );
    }
  }
}

function assertSameLengthVectors(a: Vector, b: Vector, fnName: string) {
  assertVector(a, fnName, "a");
  assertVector(b, fnName, "b");

  if (a.length !== b.length) {
    throw new Error(
      `${fnName}: vectors 'a' and 'b' must have the same length. Received ${a.length} and ${b.length}.`,
    );
  }
}

export function dotProduct(a: Vector, b: Vector): number {
  const fnName = "dotProduct";
  assertSameLengthVectors(a, b, fnName);

  let sum = 0;

  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }

  return sum;
}

export function cosineSimilarity(a: Vector, b: Vector): number {
  const fnName = "cosineSimilarity";
  assertSameLengthVectors(a, b, fnName);

  let dot = 0;
  let normASq = 0;
  let normBSq = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i];
    const bv = b[i];

    dot += av * bv;
    normASq += av * av;
    normBSq += bv * bv;
  }

  if (normASq === 0 || normBSq === 0) {
    throw new Error(
      `${fnName}: cannot compute cosine similarity with a zero-magnitude vector.`,
    );
  }

  return dot / (Math.sqrt(normASq) * Math.sqrt(normBSq));
}

export function euclideanDistance(a: Vector, b: Vector): number {
  const fnName = "euclideanDistance";
  assertSameLengthVectors(a, b, fnName);

  let sumSq = 0;

  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }

  return Math.sqrt(sumSq);
}

export function add(a: Vector, b: Vector): number[] {
  const fnName = "add";
  assertSameLengthVectors(a, b, fnName);

  const result = new Array<number>(a.length);

  for (let i = 0; i < a.length; i += 1) {
    result[i] = a[i] + b[i];
  }

  return result;
}

export function subtract(a: Vector, b: Vector): number[] {
  const fnName = "subtract";
  assertSameLengthVectors(a, b, fnName);

  const result = new Array<number>(a.length);

  for (let i = 0; i < a.length; i += 1) {
    result[i] = a[i] - b[i];
  }

  return result;
}

export function scale(vector: Vector, scalar: number): number[] {
  const fnName = "scale";
  assertVector(vector, fnName, "vector");

  if (typeof scalar !== "number" || !Number.isFinite(scalar)) {
    throw new TypeError(
      `${fnName}: expected 'scalar' to be a finite number. Received ${String(
        scalar,
      )}.`,
    );
  }

  const result = new Array<number>(vector.length);

  for (let i = 0; i < vector.length; i += 1) {
    result[i] = vector[i] * scalar;
  }

  return result;
}

export function normalize(vector: Vector): number[] {
  const fnName = "normalize";
  assertVector(vector, fnName, "vector");

  let sumSq = 0;

  for (let i = 0; i < vector.length; i += 1) {
    const value = vector[i];
    sumSq += value * value;
  }

  if (sumSq === 0) {
    throw new Error(
      `${fnName}: cannot normalize a zero-magnitude vector.`,
    );
  }

  const magnitude = Math.sqrt(sumSq);
  const result = new Array<number>(vector.length);

  for (let i = 0; i < vector.length; i += 1) {
    result[i] = vector[i] / magnitude;
  }

  return result;
}

export function slerp(a: Vector, b: Vector, t: number): Vector {
  const fnName = "slerp";
  assertSameLengthVectors(a, b, fnName);

  if (typeof t !== "number" || !Number.isFinite(t)) {
    throw new TypeError(
      `${fnName}: expected 't' to be a finite number between 0 and 1. Received ${String(t)}.`,
    );
  }

  if (t < 0 || t > 1) {
    throw new RangeError(
      `${fnName}: expected 't' to be in the inclusive range [0, 1]. Received ${t}.`,
    );
  }

  // Compute the cosine of the angle between the two vectors. This also
  // validates that the vectors are non-zero.
  const cosine = cosineSimilarity(a, b);
  const clampedCosine = Math.max(-1, Math.min(1, cosine));

  const theta = Math.acos(clampedCosine);
  const sinTheta = Math.sin(theta);

  // When the vectors are nearly parallel or antiparallel, the standard
  // slerp formula becomes numerically unstable. In that case, fall back to
  // a normalized linear interpolation.
  if (Math.abs(sinTheta) < 1e-6) {
    const weightA = 1 - t;
    const weightB = t;

    const blended = new Array<number>(a.length);

    for (let i = 0; i < a.length; i += 1) {
      blended[i] = weightA * a[i] + weightB * b[i];
    }

    return normalize(blended);
  }

  const weightA = Math.sin((1 - t) * theta) / sinTheta;
  const weightB = Math.sin(t * theta) / sinTheta;

  const result = new Array<number>(a.length);

  for (let i = 0; i < a.length; i += 1) {
    result[i] = weightA * a[i] + weightB * b[i];
  }

  return normalize(result);
}
