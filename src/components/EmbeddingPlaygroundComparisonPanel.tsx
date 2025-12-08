import {
  computeAveragePairwiseCosine,
  formatNumber,
} from "@/components/EmbeddingPlaygroundState";
import type { Experiment } from "@/components/EmbeddingPlaygroundState";
import { cosineSimilarity, euclideanDistance } from "@/lib/vectors";

type FocusedComparison = {
  index: number;
  primaryLabel: string;
  secondaryLabel: string;
  cosine: number;
  distance: number;
};

type EmbeddingPlaygroundComparisonPanelProps = {
  experiments: Experiment[];
  primaryComparisonId: string | null;
  secondaryComparisonId: string | null;
  comparisonFocusIndex: number;
  onPrimaryComparisonIdChange: (id: string | null) => void;
  onSecondaryComparisonIdChange: (id: string | null) => void;
  onComparisonFocusIndexChange: (index: number) => void;
};

function getExperimentsWithEmbeddings(experiments: Experiment[]): Experiment[] {
  return experiments.filter(
    (experiment) => experiment.embeddings && experiment.embeddings.length > 0,
  );
}

export function EmbeddingPlaygroundComparisonPanel({
  experiments,
  primaryComparisonId,
  secondaryComparisonId,
  comparisonFocusIndex,
  onPrimaryComparisonIdChange,
  onSecondaryComparisonIdChange,
  onComparisonFocusIndexChange,
}: EmbeddingPlaygroundComparisonPanelProps) {
  const experimentsWithEmbeddings = getExperimentsWithEmbeddings(experiments);

  if (experimentsWithEmbeddings.length < 2) {
    return null;
  }

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

  let focusedComparison: FocusedComparison | null = null;

  if (
    hasComparisonPair &&
    primaryExperiment &&
    secondaryExperiment &&
    maxCommonLength > 0
  ) {
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

      focusedComparison = {
        index: clampedComparisonIndex,
        primaryLabel,
        secondaryLabel,
        cosine,
        distance,
      };
    } catch {
      focusedComparison = null;
    }
  }

  const primaryAverageCosine = computeAveragePairwiseCosine(
    primaryExperiment?.embeddings ?? null,
  );

  const secondaryAverageCosine = computeAveragePairwiseCosine(
    secondaryExperiment?.embeddings ?? null,
  );

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
      <h2 className="mb-2 font-medium text-zinc-100">Comparison mode</h2>
      <p className="mb-3 text-[11px] text-zinc-400">
        Compare two experiments side by side. This is handy for baseline vs.
        modified phrases or different prompts.
      </p>

      <div className="mb-3 flex flex-wrap gap-3 md:items-end">
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
          <span>Left experiment</span>
          <select
            value={primaryId ?? ""}
            onChange={(event) =>
              onPrimaryComparisonIdChange(event.target.value || null)
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
              onSecondaryComparisonIdChange(event.target.value || null)
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
                onComparisonFocusIndexChange(Number(event.target.value) || 0)
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
                    <th className="w-24 px-2 text-right font-normal">Cosine</th>
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
  );
}
