import type { Vector } from "./math";
import { PCA } from "ml-pca";
import { UMAP } from "umap-js";

export type VectorCollection = Vector[];

type ValidatedVectors = {
  size: number;
  dimension: number;
};

function assertVectorsMatrix(
  vectors: VectorCollection,
  fnName: string,
): ValidatedVectors {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    throw new Error(
      `${fnName}: expected 'vectors' to be a non-empty array of numeric vectors.`,
    );
  }

  const first = vectors[0];

  if (!Array.isArray(first) || first.length === 0) {
    throw new Error(
      `${fnName}: expected 'vectors[0]' to be a non-empty array of numbers.`,
    );
  }

  const dimension = first.length;

  for (let i = 0; i < vectors.length; i += 1) {
    const row = vectors[i];

    if (!Array.isArray(row)) {
      throw new TypeError(
        `${fnName}: expected 'vectors[${i}]' to be an array of numbers.`,
      );
    }

    if (row.length !== dimension) {
      throw new Error(
        `${fnName}: all vectors must have the same length. Expected ${dimension}, but 'vectors[${i}]' has length ${row.length}.`,
      );
    }

    for (let j = 0; j < row.length; j += 1) {
      const value = row[j];

      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new TypeError(
          `${fnName}: 'vectors[${i}][${j}]' must be a finite number. Received ${String(
            value,
          )}.`,
        );
      }
    }
  }

  return {
    size: vectors.length,
    dimension,
  };
}

function assertTargetDimension(
  k: number,
  dimension: number,
  fnName: string,
): number {
  if (!Number.isInteger(k) || k <= 0) {
    throw new RangeError(
      `${fnName}: expected 'k' to be a positive integer. Received ${String(k)}.`,
    );
  }

  if (k > dimension) {
    throw new RangeError(
      `${fnName}: target dimension 'k' (${k}) cannot be greater than the input dimension (${dimension}).`,
    );
  }

  return k;
}

/**
* Reduce a collection of high-dimensional vectors using Principal Component Analysis (PCA).
*
* This helper is suitable for turning high-dimensional embeddings (for example,
* 384-dimensional vectors) into 2D or 3D coordinates for visualization.
*/
export function reduceWithPCA(
  vectors: VectorCollection,
  k: number,
): number[][] {
  const fnName = "reduceWithPCA";
  const { dimension } = assertVectorsMatrix(vectors, fnName);
  const components = assertTargetDimension(k, dimension, fnName);

  const pca = new PCA(vectors, {
    center: true,
    scale: false,
  });

  const projected = pca.predict(vectors, {
    nComponents: components,
  });

  return projected.to2DArray();
}

/**
* Reduce a collection of high-dimensional vectors using UMAP.
*
* UMAP is a non-linear dimensionality reduction technique that preserves local
* structure and is well-suited for visualizing clusters in embedding spaces.
*/
export function reduceWithUMAP(
  vectors: VectorCollection,
  k: number,
): number[][] {
  const fnName = "reduceWithUMAP";
  const { dimension } = assertVectorsMatrix(vectors, fnName);
  const components = assertTargetDimension(k, dimension, fnName);

  const umap = new UMAP({
    nComponents: components,
  });

  return umap.fit(vectors);
}
