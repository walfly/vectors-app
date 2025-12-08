"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmbeddingPlaygroundComparisonPanel } from "@/components/EmbeddingPlaygroundComparisonPanel";
import { EmbeddingPlaygroundExperiments } from "@/components/EmbeddingPlaygroundExperiments";
import { EmbeddingPlaygroundForm } from "@/components/EmbeddingPlaygroundForm";
import { EmbeddingPlaygroundInputsAndLabels } from "@/components/EmbeddingPlaygroundInputsAndLabels";
import { EmbeddingPlaygroundManipulationPanel } from "@/components/EmbeddingPlaygroundManipulationPanel";
import { EmbeddingPlaygroundSceneSection } from "@/components/EmbeddingPlaygroundSceneSection";
import {
  buildEmbeddingPoints,
  createExperiment,
  EXPERIMENTS_STORAGE_KEY,
  INITIAL_TEXT,
  loadInitialPlaygroundState,
  parseInputPhrases,
  readErrorMessage,
  type EmbeddingsApiResponse,
  type Experiment,
  type PlaygroundStatus,
  type ReductionApiResponse,
  type StoredPlaygroundState,
} from "@/components/EmbeddingPlaygroundState";
import { cosineSimilarity, euclideanDistance } from "@/lib/vectors";

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
              position: [...original.position] as [
                number,
                number,
                number,
              ],
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
      <EmbeddingPlaygroundExperiments
        experiments={experiments}
        activeExperiment={activeExperiment}
        onCreateExperiment={handleCreateExperiment}
        onDuplicateExperiment={handleDuplicateExperiment}
        onResetExperiment={handleResetExperiment}
        onSelectExperiment={handleSelectExperiment}
        onRenameActiveExperiment={handleRenameActiveExperiment}
      />

      <EmbeddingPlaygroundForm
        activeExperiment={activeExperiment}
        activeInput={activeInput}
        parsedInputPhrases={parsedInputPhrases}
        hasPoints={hasPoints}
        activePointsCount={activePoints.length}
        isSubmitting={isSubmitting}
        statusMessage={statusMessage}
        error={error}
        onSubmit={handleSubmit}
        onInputChange={handleInputChange}
        onAddPhrase={handleAddPhrase}
        onPhraseEdit={handlePhraseEdit}
        onPhraseRemove={handlePhraseRemove}
      />

      <EmbeddingPlaygroundSceneSection
        points={activePoints}
        manipulationMode={manipulationMode}
        hasPoints={hasPoints}
        selectedPointId={selectedPointId}
        onToggleManipulationMode={handleToggleManipulationMode}
        onPointSelect={handlePointSelect}
      />

      <EmbeddingPlaygroundManipulationPanel
        manipulationMode={manipulationMode}
        hasPoints={hasPoints}
        activeExperiment={activeExperiment}
        selectedPointIndex={selectedPointIndex}
        selectedPoint={selectedPoint}
        selectedPointNeighbors={selectedPointNeighbors}
        onNudgeSelectedPoint={handleNudgeSelectedPoint}
        onResetSelectedPointPosition={handleResetSelectedPointPosition}
      />

      <EmbeddingPlaygroundInputsAndLabels
        hasPoints={hasPoints}
        activePoints={activePoints}
        onPointLabelChange={handlePointLabelChange}
      />

      <EmbeddingPlaygroundComparisonPanel
        experiments={experiments}
        primaryComparisonId={primaryComparisonId}
        secondaryComparisonId={secondaryComparisonId}
        comparisonFocusIndex={comparisonFocusIndex}
        onPrimaryComparisonIdChange={setPrimaryComparisonId}
        onSecondaryComparisonIdChange={setSecondaryComparisonId}
        onComparisonFocusIndexChange={setComparisonFocusIndex}
      />
    </div>
  );
}
