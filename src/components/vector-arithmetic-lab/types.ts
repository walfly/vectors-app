export type EquationTerm = {
  id: string;
  token: string;
  weight: number;
};

export type Neighbor = {
  id: string;
  score: number;
};

export type LabStatus = "idle" | "embedding" | "arithmetic" | "nearest";
