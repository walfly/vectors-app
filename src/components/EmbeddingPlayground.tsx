"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  EmbeddingScene,
  type EmbeddingPoint,
} from "@/components/EmbeddingScene";
import { cosineSimilarity, euclideanDistance } from "@/lib/vectors";

type EmbeddingsApiResponse = {
  model: string;
  embeddings: number[][];
  dimensions: number;
};

type ReductionApiResponse = {
  points: number[][];
  method: "pca" | "umap";
};

type PlaygroundStatus = "idle" | "embedding" | "reducing";

type Experiment = {
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

type StoredPlaygroundState = {
  experiments: Experiment[];
  activeExperimentId: string;
};

const INITIAL_TEXT = ["king", "queen", "man", "woman"].join("\n");
const EXPERIMENTS_STORAGE_KEY = "embedding-playground-experiments-v1";

function parseInputPhrases(raw: string): string[] {
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

async function readErrorMessage(response: Response): Promise<string> {
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

function buildEmbeddingPoints(
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

function createExperiment(index: number, input: string = INITIAL_TEXT): Experiment {
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

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "–";
  }

  return value.toFixed(3);
}

function computeAveragePairwiseCosine(embeddings: number[][] | null): number | null {
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
function loadInitialPlaygroundState(): StoredPlaygroundState {
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
          return {
            experiments: parsed.experiments.map((experiment, index) => {
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

              return {
                ...experiment,
                id: experiment.id || `exp-${Date.now()}-${index + 1}`,
                name: experiment.name || `Experiment ${index + 1}`,
                input: experiment.input ?? INITIAL_TEXT,
                points,
                originalPoints,
                embeddings,
                model: experiment.model ?? null,
                reductionMethod: experiment.reductionMethod ?? null,
                createdAt: experiment.createdAt ?? Date.now(),
              };
            }),
            activeExperimentId: parsed.activeExperimentId,
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

export function EmbeddingPlayground() {
  const [playgroundState, setPlaygroundState] = useState<StoredPlaygroundState>(
    () => loadInitialPlaygroundState(),
  );

  const [status, setStatus] = useState<PlaygroundStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manipulationMode, setManipulationMode] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [primaryComparisonId, setPrimaryComparisonId] =
    useState<string | null>(null);
  const [secondaryComparisonId, setSecondaryComparisonId] =
    useState<string | null>(null);
  const [comparisonFocusIndex, setComparisonFocusIndex] = useState(0);

  // Persist experiments to localStorage whenever they change.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        EXPERIMENTS_STORAGE_KEY,
        JSON.stringify(playgroundState),
      );
    } catch {
      // Ignore storage errors in the playground UI.
    }
  }, [playgroundState]);

  const { experiments, activeExperimentId } = playgroundState;

  const activeExperiment = useMemo(
    () =>
      experiments.find((experiment) => experiment.id === activeExperimentId) ??
      experiments[0],
    [experiments, activeExperimentId],
  );

  const activeInput = activeExperiment?.input ?? "";
  const activePoints = useMemo(
    () => activeExperiment?.points ?? [],
    [activeExperiment?.points],
  );
  const hasPoints = activePoints.length > 0;
  const isSubmitting = status !== "idle";

  const handleActiveExperimentChange = useCallback(
    (updater: (experiment: Experiment) => Experiment) => {
      setPlaygroundState((current) => {
        const {
          experiments: currentExperiments,
          activeExperimentId: currentActiveId,
        } = current;

        const index = currentExperiments.findIndex(
          (experiment) => experiment.id === currentActiveId,
        );

        if (index === -1) {
          return current;
        }

        const updated = [...currentExperiments];
        updated[index] = updater(currentExperiments[index]);

        return {
          ...current,
          experiments: updated,
        };
      });
    },
    [],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.target.value;

      handleActiveExperimentChange((experiment) => ({
        ...experiment,
        input: newValue,
      }));
    },
    [handleActiveExperimentChange],
  );

  const handlePhraseEdit = useCallback(
    (index: number, value: string) => {
      handleActiveExperimentChange((experiment) => {
        const phrases = parseInputPhrases(experiment.input);

        if (index < 0 || index >= phrases.length) {
          return experiment;
        }

        const nextPhrases = [...phrases];
        nextPhrases[index] = value;

        return {
          ...experiment,
          input: nextPhrases.join("\n"),
        };
      });
    },
    [handleActiveExperimentChange],
  );

  const handlePhraseRemove = useCallback(
    (index: number) => {
      handleActiveExperimentChange((experiment) => {
        const phrases = parseInputPhrases(experiment.input);

        if (index < 0 || index >= phrases.length) {
          return experiment;
        }

        const nextPhrases = phrases.filter((_, phraseIndex) => phraseIndex !== index);

        return {
          ...experiment,
          input: nextPhrases.join("\n"),
        };
      });
    },
    [handleActiveExperimentChange],
  );

  const handleAddPhrase = useCallback(() => {
    handleActiveExperimentChange((experiment) => {
      const phrases = parseInputPhrases(experiment.input);
      const nextPhrases = [...phrases, ""];

      return {
        ...experiment,
        input: nextPhrases.join("\n"),
      };
    });
  }, [handleActiveExperimentChange]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!activeExperiment) {
        return;
      }

      const phrases = parseInputPhrases(activeExperiment.input);

      if (phrases.length === 0) {
        setError("Enter at least one word or phrase to generate embeddings.");
        return;
      }

      setError(null);
      setStatus("embedding");
      setStatusMessage(
        "Generating embeddings. This can take a few seconds on a cold start.",
      );

      let embeddingsResponse: EmbeddingsApiResponse;

      try {
        const response = await fetch("/api/embeddings", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: phrases }),
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);
          setError(message);
          setStatus("idle");
          setStatusMessage(null);
          return;
        }

        embeddingsResponse = (await response.json()) as EmbeddingsApiResponse;
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unexpected error while calling /api/embeddings.",
        );
        setStatus("idle");
        setStatusMessage(null);
        return;
      }

      setStatus("reducing");
      setStatusMessage("Reducing embeddings to 3D for visualization...");

      try {
        const response = await fetch("/api/reduce", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vectors: embeddingsResponse.embeddings,
            method: "pca",
            dimensions: 3,
          }),
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);
          setError(message);
          setStatus("idle");
          setStatusMessage(null);
          return;
        }

        const reduced = (await response.json()) as ReductionApiResponse;
        const nextPoints = buildEmbeddingPoints(reduced.points, phrases);

        setPlaygroundState((current) => {
          const {
            experiments: currentExperiments,
            activeExperimentId: currentActiveId,
          } = current;

          const index = currentExperiments.findIndex(
            (experiment) => experiment.id === currentActiveId,
          );

          if (index === -1) {
            return current;
          }

          const updatedExperiments = [...currentExperiments];
          const previous = currentExperiments[index];

          updatedExperiments[index] = {
            ...previous,
            points: nextPoints,
            originalPoints: nextPoints,
            embeddings: embeddingsResponse.embeddings,
            model: embeddingsResponse.model,
            reductionMethod: reduced.method,
          };

          return {
            ...current,
            experiments: updatedExperiments,
          };
        });

        setStatus("idle");
        setStatusMessage(null);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unexpected error while calling /api/reduce.",
        );
        setStatus("idle");
        setStatusMessage(null);
      }
    },
    [activeExperiment],
  );

  const handleCreateExperiment = useCallback(() => {
    setPlaygroundState((current) => {
      const nextIndex = current.experiments.length + 1;
      const experiment = createExperiment(nextIndex, INITIAL_TEXT);

      return {
        experiments: [...current.experiments, experiment],
        activeExperimentId: experiment.id,
      };
    });

    setSelectedPointId(null);
    setError(null);
    setStatus("idle");
    setStatusMessage(null);
  }, []);

  const handleDuplicateExperiment = useCallback(() => {
    if (!activeExperiment) {
      return;
    }

    setPlaygroundState((current) => {
      const createdAt = Date.now();
      const duplicateExperiment: Experiment = {
        ...activeExperiment,
        id: `exp-${createdAt}-${current.experiments.length + 1}`,
        name: `${activeExperiment.name || "Experiment"} (copy)` as string,
        createdAt,
        points: activeExperiment.points.map((point) => ({ ...point })),
        originalPoints: activeExperiment.originalPoints.map((point) => ({
          ...point,
        })),
        embeddings: activeExperiment.embeddings
          ? activeExperiment.embeddings.map((row) => [...row])
          : null,
      };

      const experimentsWithDuplicate = [
        ...current.experiments,
        duplicateExperiment,
      ];

      return {
        experiments: experimentsWithDuplicate,
        activeExperimentId: duplicateExperiment.id,
      };
    });

    setSelectedPointId(null);
    setError(null);
    setStatus("idle");
    setStatusMessage(null);
  }, [activeExperiment]);

  const handleResetExperiment = useCallback(() => {
    handleActiveExperimentChange((experiment) => ({
      ...experiment,
      input: INITIAL_TEXT,
      points: [],
      originalPoints: [],
      embeddings: null,
      model: null,
      reductionMethod: null,
    }));

    setSelectedPointId(null);
    setError(null);
    setStatus("idle");
    setStatusMessage(null);
  }, [handleActiveExperimentChange]);

  const handleRenameActiveExperiment = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextName = event.target.value;

      handleActiveExperimentChange((experiment) => ({
        ...experiment,
        name: nextName,
      }));
    },
    [handleActiveExperimentChange],
  );

  const handleSelectExperiment = useCallback((experimentId: string) => {
    setPlaygroundState((current) => ({
      ...current,
      activeExperimentId: experimentId,
    }));

    setSelectedPointId(null);
    setError(null);
    setStatus("idle");
    setStatusMessage(null);
  }, []);

  const parsedInputPhrases = useMemo(
    () => parseInputPhrases(activeInput),
    [activeInput],
  );

  const experimentsWithEmbeddings = useMemo(
    () =>
      experiments.filter(
        (experiment) => experiment.embeddings && experiment.embeddings.length > 0,
      ),
    [experiments],
  );

  const primaryId =
    primaryComparisonId &&
    experimentsWithEmbeddings.some(
      (experiment) => experiment.id === primaryComparisonId,
    )
      ? primaryComparisonId
      : experimentsWithEmbeddings[0]?.id ?? null;

  const secondaryId =
    secondaryComparisonId &&
    experimentsWithEmbeddings.some(
      (experiment) => experiment.id === secondaryComparisonId,
    ) &&
    secondaryComparisonId !== primaryId
      ? secondaryComparisonId
      : experimentsWithEmbeddings.find(
          (experiment) => experiment.id !== primaryId,
        )?.id ?? null;

  const primaryExperiment =
    primaryId &&
    experimentsWithEmbeddings.find((experiment) => experiment.id === primaryId)
      ? experimentsWithEmbeddings.find(
          (experiment) => experiment.id === primaryId,
        )
      : null;

  const secondaryExperiment =
    secondaryId &&
    experimentsWithEmbeddings.find(
      (experiment) => experiment.id === secondaryId,
    )
      ? experimentsWithEmbeddings.find(
          (experiment) => experiment.id === secondaryId,
        )
      : null;

  const hasComparisonPair =
    primaryExperiment &&
    secondaryExperiment &&
    primaryExperiment.embeddings &&
    secondaryExperiment.embeddings &&
    primaryExperiment.embeddings.length > 0 &&
    secondaryExperiment.embeddings.length > 0 &&
    primaryExperiment.embeddings[0].length ===
      secondaryExperiment.embeddings[0].length;

  const maxCommonLength =
    hasComparisonPair && primaryExperiment && secondaryExperiment
      ? Math.min(
          primaryExperiment.embeddings!.length,
          secondaryExperiment.embeddings!.length,
        )
      : 0;

  const clampedComparisonIndex =
    hasComparisonPair && maxCommonLength > 0
      ? Math.min(Math.max(comparisonFocusIndex, 0), maxCommonLength - 1)
      : 0;

  const focusedComparison = useMemo(() => {
    if (
      !hasComparisonPair ||
      !primaryExperiment ||
      !secondaryExperiment ||
      maxCommonLength === 0
    ) {
      return null;
    }

    const primaryVector = primaryExperiment.embeddings![clampedComparisonIndex];
    const secondaryVector =
      secondaryExperiment.embeddings![clampedComparisonIndex];

    try {
      const cosine = cosineSimilarity(primaryVector, secondaryVector);
      const distance = euclideanDistance(primaryVector, secondaryVector);

      const primaryLabel =
        primaryExperiment.points[clampedComparisonIndex]?.label ??
        `Item ${clampedComparisonIndex + 1}`;
      const secondaryLabel =
        secondaryExperiment.points[clampedComparisonIndex]?.label ??
        `Item ${clampedComparisonIndex + 1}`;

      return {
        index: clampedComparisonIndex,
        primaryLabel,
        secondaryLabel,
        cosine,
        distance,
      };
    } catch {
      return null;
    }
  }, [
    clampedComparisonIndex,
    hasComparisonPair,
    maxCommonLength,
    primaryExperiment,
    secondaryExperiment,
  ]);

  const primaryAverageCosine = useMemo(
    () => computeAveragePairwiseCosine(primaryExperiment?.embeddings ?? null),
    [primaryExperiment?.embeddings],
  );

  const secondaryAverageCosine = useMemo(
    () =>
      computeAveragePairwiseCosine(secondaryExperiment?.embeddings ?? null),
    [secondaryExperiment?.embeddings],
  );

  const selectedPoint = useMemo(
    () => activePoints.find((point) => point.id === selectedPointId) ?? null,
    [activePoints, selectedPointId],
  );

  const selectedPointIndex = useMemo(
    () =>
      selectedPoint
        ? activePoints.findIndex((point) => point.id === selectedPoint.id)
        : -1,
    [activePoints, selectedPoint],
  );

  const selectedPointNeighbors = useMemo(() => {
    if (
      !activeExperiment ||
      !activeExperiment.embeddings ||
      selectedPointIndex < 0
    ) {
      return [];
    }

    const target = activeExperiment.embeddings[selectedPointIndex];
    const neighbors: {
      index: number;
      label: string;
      cosine: number;
      distance: number;
    }[] = [];

    const count = Math.min(
      activeExperiment.points.length,
      activeExperiment.embeddings.length,
    );

    for (let index = 0; index < count; index += 1) {
      if (index === selectedPointIndex) {
        continue;
      }

      const candidateVector = activeExperiment.embeddings[index];

      try {
        const cosine = cosineSimilarity(target, candidateVector);
        const distance = euclideanDistance(target, candidateVector);
        const label =
          activeExperiment.points[index]?.label ?? `Item ${index + 1}`;

        neighbors.push({
          index,
          label,
          cosine,
          distance,
        });
      } catch {
        // Ignore invalid vectors; they should be rare.
      }
    }

    neighbors.sort((a, b) => b.cosine - a.cosine);

    return neighbors.slice(0, 5);
  }, [activeExperiment, selectedPointIndex]);

  const handleToggleManipulationMode = useCallback(() => {
    setManipulationMode((current) => !current);
    setSelectedPointId(null);
  }, []);

  const handlePointSelect = useCallback(
    (pointId: string | null) => {
      if (!manipulationMode) {
        return;
      }

      setSelectedPointId(pointId);
    },
    [manipulationMode],
  );

  const handleNudgeSelectedPoint = useCallback(
    (axis: 0 | 1 | 2, delta: number) => {
      if (!selectedPointId) {
        return;
      }

      handleActiveExperimentChange((experiment) => {
        const index = experiment.points.findIndex(
          (point) => point.id === selectedPointId,
        );

        if (index === -1) {
          return experiment;
        }

        const nextPoints = experiment.points.map((point, pointIndex) => {
          if (pointIndex !== index) {
            return point;
          }

          const nextPosition =
            [...point.position] as [number, number, number];
          nextPosition[axis] = nextPosition[axis] + delta;

          return {
            ...point,
            position: nextPosition,
          };
        });

        return {
          ...experiment,
          points: nextPoints,
        };
      });
    },
    [handleActiveExperimentChange, selectedPointId],
  );

  const handleResetSelectedPointPosition = useCallback(() => {
    if (!selectedPointId) {
      return;
    }

    handleActiveExperimentChange((experiment) => {
      const index = experiment.points.findIndex(
        (point) => point.id === selectedPointId,
      );

      if (index === -1 || index >= experiment.originalPoints.length) {
        return experiment;
      }

      const original = experiment.originalPoints[index];

      const nextPoints = experiment.points.map((point, pointIndex) =>
        pointIndex === index
          ? {
              ...point,
              position: [...original.position],
            }
          : point,
      );

      return {
        ...experiment,
        points: nextPoints,
      };
    });
  }, [handleActiveExperimentChange, selectedPointId]);

  const handlePointLabelChange = useCallback(
    (pointId: string, label: string) => {
      handleActiveExperimentChange((experiment) => {
        const nextPoints = experiment.points.map((point) =>
          point.id === pointId ? { ...point, label } : point,
        );
        const nextOriginalPoints = experiment.originalPoints.map((point) =>
          point.id === pointId ? { ...point, label } : point,
        );

        return {
          ...experiment,
          points: nextPoints,
          originalPoints: nextOriginalPoints,
        };
      });
    },
    [handleActiveExperimentChange],
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="font-medium text-zinc-100">Experiments</p>
            <p className="max-w-xl text-[11px] text-zinc-400">
              Create multiple experiments to tweak inputs, rename them, and
              compare how their embeddings behave side by side.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCreateExperiment}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-100 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              New experiment
            </button>
            <button
              type="button"
              onClick={handleDuplicateExperiment}
              disabled={!activeExperiment}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-200 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={handleResetExperiment}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-200 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-900"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {experiments.map((experiment, index) => {
            const isActive = experiment.id === activeExperiment?.id;

            return (
              <button
                key={experiment.id}
                type="button"
                onClick={() => handleSelectExperiment(experiment.id)}
                className={[
                  "rounded-full border px-3 py-1 text-[11px] font-medium shadow-sm transition",
                  isActive
                    ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                    : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800",
                ].join(" ")}
              >
                {experiment.name || `Experiment ${index + 1}`}
              </button>
            );
          })}
        </div>

        {activeExperiment && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="whitespace-nowrap">Active experiment name</span>
              <input
                type="text"
                value={activeExperiment.name}
                onChange={handleRenameActiveExperiment}
                className="min-w-[160px] rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              />
            </label>
            {activeExperiment.embeddings &&
              activeExperiment.embeddings.length > 0 && (
                <p className="text-[11px] text-zinc-500">
                  Last run model:{" "}
                  <span className="font-mono text-zinc-300">
                    {activeExperiment.model ?? "unknown"}
                  </span>
                  {activeExperiment.reductionMethod && (
                    <>
                      {" "}· reduced with{" "}
                      <span className="font-mono uppercase">
                        {activeExperiment.reductionMethod}
                      </span>
                    </>
                  )}
                </p>
              )}
          </div>
        )}
      </section>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-zinc-100">Text inputs</span>
          <span className="text-xs text-zinc-400">
            Enter one word or short phrase per line. Use experiments to explore
            variations without losing your previous runs.
          </span>
          <textarea
            value={activeInput}
            onChange={handleInputChange}
            rows={5}
            className="mt-1 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 shadow-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            spellCheck={false}
          />
        </label>

        <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-medium text-zinc-100">Entries</p>
            <button
              type="button"
              onClick={handleAddPhrase}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-100 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Add entry
            </button>
          </div>
          {parsedInputPhrases.length === 0 ? (
            <p className="text-[11px] text-zinc-500">
              No entries yet. Start typing above, or use the sample starting
              text.
            </p>
          ) : (
            <ul className="space-y-1">
              {parsedInputPhrases.map((phrase, index) => (
                <li
                  key={`${index}-${phrase}`}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <span className="w-5 text-right font-mono text-[10px] text-zinc-500">
                    {index + 1}.
                  </span>
                  <input
                    type="text"
                    value={phrase}
                    onChange={(event) =>
                      handlePhraseEdit(index, event.target.value)
                    }
                    className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() => handlePhraseRemove(index)}
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-300 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-900"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
          <div>
            {hasPoints ? (
              <span>
                Showing {activePoints.length} point
                {activePoints.length === 1 ? "" : "s"}
                {activeExperiment?.reductionMethod
                  ? ` reduced with ${activeExperiment.reductionMethod.toUpperCase()}`
                  : ""}
                {activeExperiment?.model
                  ? ` from ${activeExperiment.model}`
                  : ""}
                .
              </span>
            ) : (
              <span>Ready to generate embeddings for your inputs.</span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Generating..." : "Generate embeddings"}
          </button>
        </div>

        {statusMessage && (
          <p className="text-xs text-zinc-400">{statusMessage}</p>
        )}

        {error && (
          <p className="text-xs font-medium text-red-400">{error}</p>
        )}
      </form>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-300">
          <div className="space-y-1">
            <h2 className="font-medium text-zinc-100">Embedding scene</h2>
            <p className="max-w-md text-[11px] text-zinc-400">
              Hover to inspect labels. Toggle manipulation mode to select a
              point, nudge its position, and see how its nearest neighbors
              change.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleManipulationMode}
            disabled={!hasPoints}
            className={[
              "rounded-md border px-3 py-1.5 text-[11px] font-medium shadow-sm transition",
              manipulationMode
                ? "border-emerald-400 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300 hover:bg-emerald-500/20"
                : "border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900",
              !hasPoints ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
          >
            {manipulationMode
              ? "Manipulation mode: On"
              : "Manipulation mode: Off"}
          </button>
        </div>

        <EmbeddingScene
          points={activePoints}
          selectedPointId={manipulationMode ? selectedPointId : null}
          onPointSelect={handlePointSelect}
          emptyState={
            <p className="max-w-sm text-center text-xs text-zinc-400">
              Enter a few words like <code>king</code>, <code>queen</code>,
              <code>man</code>, and <code>woman</code> above, then click
              <span className="font-medium"> Generate embeddings</span> to see
              them plotted here.
            </p>
          }
        />
      </section>

      {manipulationMode && hasPoints && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
          <h2 className="mb-2 font-medium text-zinc-100">
            Manipulation tools
          </h2>
          {!activeExperiment?.embeddings || selectedPointIndex < 0 ? (
            <p className="text-[11px] text-zinc-400">
              Select a point in the scene to inspect its coordinates and
              nearest neighbors.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-400">
                    Selected point{" "}
                    <span className="font-mono text-zinc-200">
                      #{selectedPointIndex + 1}
                    </span>
                  </p>
                  <p className="text-[11px] text-zinc-300">
                    Label:{" "}
                    <span className="font-mono text-zinc-100">
                      {selectedPoint?.label ??
                        `Item ${selectedPointIndex + 1}`}
                    </span>
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Coordinates:{" "}
                    <span className="font-mono text-xs text-zinc-100">
                      {selectedPoint?.position
                        .map((value) => value.toFixed(3))
                        .join(", ")}
                    </span>
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1 text-[11px]">
                  <span className="text-zinc-400">Nudge along axes</span>
                  <div className="flex flex-wrap gap-2">
                    {(["x", "y", "z"] as const).map((axisLabel, axisIndex) => (
                      <div
                        key={axisLabel}
                        className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1"
                      >
                        <span className="w-3 text-center text-[10px] uppercase text-zinc-500">
                          {axisLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleNudgeSelectedPoint(axisIndex, -0.2)
                          }
                          className="h-6 w-6 rounded border border-zinc-700 text-[10px] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleNudgeSelectedPoint(axisIndex, 0.2)
                          }
                          className="h-6 w-6 rounded border border-zinc-700 text-[10px] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
                        >
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleResetSelectedPointPosition}
                    className="mt-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900"
                  >
                    Reset point position
                  </button>
                </div>
              </div>

              {selectedPointNeighbors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-400">
                    Nearest neighbors by cosine similarity (within this
                    experiment):
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed border-separate border-spacing-y-1 text-[11px]">
                      <thead className="text-zinc-400">
                        <tr>
                          <th className="w-12 px-2 text-left font-normal">
                            #
                          </th>
                          <th className="px-2 text-left font-normal">
                            Label
                          </th>
                          <th className="w-24 px-2 text-right font-normal">
                            Cosine
                          </th>
                          <th className="w-28 px-2 text-right font-normal">
                            Distance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPointNeighbors.map((neighbor) => (
                          <tr
                            key={neighbor.index}
                            className="rounded-md border border-zinc-800 bg-zinc-950"
                          >
                            <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-500">
                              {neighbor.index + 1}
                            </td>
                            <td className="truncate px-2 py-1 text-zinc-200">
                              {neighbor.label}
                            </td>
                            <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-300">
                              {formatNumber(neighbor.cosine)}
                            </td>
                            <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-300">
                              {formatNumber(neighbor.distance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {hasPoints && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
          <h2 className="mb-2 font-medium text-zinc-100">Inputs and labels</h2>
          <p className="mb-2 text-[11px] text-zinc-400">
            Edit labels to control what appears next to each point in the 3D
            scene. This is useful for shortening long phrases or annotating
            categories.
          </p>
          <ul className="grid gap-1 sm:grid-cols-2 md:grid-cols-3">
            {activePoints.map((point, index) => (
              <li
                key={point.id}
                className="flex items-center gap-2 truncate text-zinc-400"
              >
                <span className="w-6 text-right font-mono text-[10px] text-zinc-500">
                  {index + 1}.
                </span>
                <input
                  type="text"
                  value={point.label ?? ""}
                  onChange={(event) =>
                    handlePointLabelChange(point.id, event.target.value)
                  }
                  className="min-w-0 flex-1 truncate rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {experimentsWithEmbeddings.length >= 2 && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
          <h2 className="mb-2 font-medium text-zinc-100">Comparison mode</h2>
          <p className="mb-3 text-[11px] text-zinc-400">
            Compare two experiments side by side. This is handy for baseline
            vs. modified phrases or different prompts.
          </p>

          <div className="mb-3 flex flex-wrap gap-3 md:items-end">
            <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
              <span>Left experiment</span>
              <select
                value={primaryId ?? ""}
                onChange={(event) =>
                  setPrimaryComparisonId(event.target.value || null)
                }
                className="min-w-[160px] rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              >
                {experimentsWithEmbeddings.map((experiment) => (
                  <option key={experiment.id} value={experiment.id}>
                    {experiment.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
              <span>Right experiment</span>
              <select
                value={secondaryId ?? ""}
                onChange={(event) =>
                  setSecondaryComparisonId(event.target.value || null)
                }
                className="min-w-[160px] rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              >
                {experimentsWithEmbeddings
                  .filter((experiment) => experiment.id !== primaryId)
                  .map((experiment) => (
                    <option key={experiment.id} value={experiment.id}>
                      {experiment.name}
                    </option>
                  ))}
              </select>
            </label>

            {hasComparisonPair && maxCommonLength > 0 && (
              <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                <span>Focus input index</span>
                <select
                  value={String(clampedComparisonIndex)}
                  onChange={(event) =>
                    setComparisonFocusIndex(Number(event.target.value) || 0)
                  }
                  className="min-w-[140px] rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                >
                  {Array.from({ length: maxCommonLength }).map((_, index) => (
                    <option key={index} value={index}>
                      #{index + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {!hasComparisonPair || !primaryExperiment || !secondaryExperiment ? (
            <p className="text-[11px] text-zinc-400">
              Run embeddings for at least two experiments with the same model
              before comparing them.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                  <p className="mb-1 text-[11px] font-medium text-zinc-100">
                    {primaryExperiment.name}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Inputs: {primaryExperiment.embeddings?.length ?? 0}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Avg pairwise cosine:{" "}
                    <span className="font-mono text-zinc-200">
                      {formatNumber(primaryAverageCosine)}
                    </span>
                  </p>
                </div>
                <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                  <p className="mb-1 text-[11px] font-medium text-zinc-100">
                    {secondaryExperiment.name}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Inputs: {secondaryExperiment.embeddings?.length ?? 0}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Avg pairwise cosine:{" "}
                    <span className="font-mono text-zinc-200">
                      {formatNumber(secondaryAverageCosine)}
                    </span>
                  </p>
                </div>
                {focusedComparison && (
                  <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                    <p className="mb-1 text-[11px] font-medium text-zinc-100">
                      Focused pair #{focusedComparison.index + 1}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Left label:{" "}
                      <span className="font-mono text-zinc-200">
                        {focusedComparison.primaryLabel}
                      </span>
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Right label:{" "}
                      <span className="font-mono text-zinc-200">
                        {focusedComparison.secondaryLabel}
                      </span>
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Cosine similarity:{" "}
                      <span className="font-mono text-zinc-200">
                        {formatNumber(focusedComparison.cosine)}
                      </span>
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Euclidean distance:{" "}
                      <span className="font-mono text-zinc-200">
                        {formatNumber(focusedComparison.distance)}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {maxCommonLength > 1 && (
                <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950">
                  <table className="min-w-full table-fixed border-separate border-spacing-y-1 text-[11px]">
                    <thead className="text-zinc-400">
                      <tr>
                        <th className="w-10 px-2 text-left font-normal">#</th>
                        <th className="px-2 text-left font-normal">
                          {primaryExperiment.name}
                        </th>
                        <th className="px-2 text-left font-normal">
                          {secondaryExperiment.name}
                        </th>
                        <th className="w-24 px-2 text-right font-normal">
                          Cosine
                        </th>
                        <th className="w-28 px-2 text-right font-normal">
                          Distance
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxCommonLength }).map((_, index) => {
                        const leftVector = primaryExperiment.embeddings![index];
                        const rightVector =
                          secondaryExperiment.embeddings![index];

                        let cosine: number | null = null;
                        let distance: number | null = null;

                        try {
                          cosine = cosineSimilarity(leftVector, rightVector);
                          distance = euclideanDistance(leftVector, rightVector);
                        } catch {
                          // Ignore invalid vector pairs.
                        }

                        const leftLabel =
                          primaryExperiment.points[index]?.label ??
                          `Item ${index + 1}`;
                        const rightLabel =
                          secondaryExperiment.points[index]?.label ??
                          `Item ${index + 1}`;

                        const isFocused = index === clampedComparisonIndex;

                        return (
                          <tr
                            key={index}
                            className={[
                              "rounded-md border border-zinc-800",
                              isFocused ? "bg-zinc-900" : "bg-zinc-950",
                            ].join(" ")}
                          >
                            <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-500">
                              {index + 1}
                            </td>
                            <td className="truncate px-2 py-1 text-zinc-200">
                              {leftLabel}
                            </td>
                            <td className="truncate px-2 py-1 text-zinc-200">
                              {rightLabel}
                            </td>
                            <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-300">
                              {formatNumber(cosine)}
                            </td>
                            <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-300">
                              {formatNumber(distance)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
