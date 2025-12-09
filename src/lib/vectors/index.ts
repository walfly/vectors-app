export type { Vector } from "./math";
export {
  add,
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  normalize,
  slerp,
  scale,
} from "./math";

export type { VectorCollection } from "./reduction";
export { reduceWithPCA, reduceWithUMAP } from "./reduction";
