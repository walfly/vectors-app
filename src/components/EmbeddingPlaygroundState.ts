import { cosineSimilarity } from "@/lib/vectors";
import type { EmbeddingPoint } from "@/components/EmbeddingScene";

export type EmbeddingsApiResponse = {
  model: string;
  embeddings: number[][];
  dimensions: number;
};

export type ReductionApiResponse = {
  points: number[][];
  method: "pca" | "umap";
};

export type PlaygroundStatus = "idle" | "embedding" | "reducing";

export type Experiment = {
  id: string;
  name: string;
  input: string;
  points: EmbeddingPoint[];
  originalPoints: EmbeddingPoint[];
  embeddings: number[][] | null;
  model: string | null;
  reductionMethod: "pca" | "umap" | null;
  createdAt: number;
};

export type StoredPlaygroundState = {
  experiments: Experiment[];
  activeExperimentId: string;
};

export const INITIAL_TEXT = ["king", "queen", "man", "woman"].join("\n");

export const EXPERIMENTS_STORAGE_KEY = "embedding-playground-experiments-v1";

export function parseInputPhrases(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n");

  if (normalized.includes("\n")) {
    return normalized
      .split("\n")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  return normalized
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}.`;

  try {
    const data = (await response.json()) as
      | {
          error?: string;
          details?: string;
          status?: string;
          model?: string;
        }
      | null;

    if (!data || typeof data.error !== "string") {
      return fallback;
    }

    if (data.status === "initializing") {
      return `${data.error} The embeddings model is still loading; try again in a few seconds.`;
    }

    if (typeof data.details === "string" && data.details.length > 0) {
      return `${data.error} (${data.details})`;
    }

    return data.error;
  } catch {
    return fallback;
  }
}

export function buildEmbeddingPoints(
  reducedPoints: number[][],
  labels: string[],
): EmbeddingPoint[] {
  return reducedPoints.map((coords, index) => {
    const [x, y, z = 0] = coords;

    return {
      id: `point-${index}`,
      position: [x, y, z],
      label: labels[index] ?? `Item ${index + 1}`,
    } satisfies EmbeddingPoint;
  });
}

export function createExperiment(
  index: number,
  input: string = INITIAL_TEXT,
): Experiment {
  const createdAt = Date.now();

  return {
    id: `exp-${createdAt}-${index}`,
    name: `Experiment ${index}`,
    input,
    points: [],
    originalPoints: [],
    embeddings: null,
    model: null,
    reductionMethod: null,
    createdAt,
  };
}

export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "–";
  }

  return value.toFixed(3);
}

export function computeAveragePairwiseCosine(
  embeddings: number[][] | null,
): number | null {
  if (!embeddings || embeddings.length < 2) {
    return null;
  }

  const count = embeddings.length;
  let sum = 0;
  let pairs = 0;

  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      try {
        sum += cosineSimilarity(embeddings[i], embeddings[j]);
        pairs += 1;
      } catch {
        // Ignore invalid vector pairs.
      }
    }
  }

  if (pairs === 0) {
    return null;
  }

  return sum / pairs;
}

export function loadInitialPlaygroundState(): StoredPlaygroundState {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(EXPERIMENTS_STORAGE_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as StoredPlaygroundState | null;

        if (
          parsed &&
          Array.isArray(parsed.experiments) &&
          parsed.experiments.length > 0 &&
          typeof parsed.activeExperimentId === "string"
        ) {
          const experiments = parsed.experiments.map((experiment, index) => {
              const now = Date.now();
              const embeddings = experiment.embeddings ?? null;
              const embeddingsLength =
                embeddings && Array.isArray(embeddings)
                  ? embeddings.length
                  : 0;

              const rawPoints = experiment.points ?? [];
              const rawOriginalPoints = experiment.originalPoints ?? [];

              const points =
                embeddingsLength > 0
                  ? rawPoints.slice(0, embeddingsLength)
                  : rawPoints;
              const originalPoints =
                embeddingsLength > 0
                  ? rawOriginalPoints.slice(0, embeddingsLength)
                  : rawOriginalPoints;

              const createdAt = experiment.createdAt ?? now;

              return {
                ...experiment,
                id: experiment.id || `exp-${createdAt}-${index + 1}`,
                name: experiment.name || `Experiment ${index + 1}`,
                input: experiment.input ?? INITIAL_TEXT,
                points,
                originalPoints,
                embeddings,
                model: experiment.model ?? null,
                reductionMethod: experiment.reductionMethod ?? null,
                createdAt,
              };
            });

          const activeExperimentId = experiments.some(
            (experiment) => experiment.id === parsed.activeExperimentId,
          )
            ? parsed.activeExperimentId
            : experiments[0]!.id;

          return {
            experiments,
            activeExperimentId,
          };
        }
      }
    } catch {
      // Ignore storage errors and fall back to in-memory defaults.
    }
  }

  const initialExperiment = createExperiment(1, INITIAL_TEXT);

  return {
    experiments: [initialExperiment],
    activeExperimentId: initialExperiment.id,
  };
}
