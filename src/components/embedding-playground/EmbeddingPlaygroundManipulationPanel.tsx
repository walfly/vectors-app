import { formatNumber } from "./EmbeddingPlaygroundState";
import type { Experiment } from "./EmbeddingPlaygroundState";
import { cosineSimilarity, euclideanDistance } from "@/lib/vectors";

type EmbeddingPlaygroundManipulationPanelProps = {
  hasPoints: boolean;
  activeExperiment: Experiment | null;
  selectedPointIds: string[];
  maxSelectedPoints: number;
};

type SelectedPointForSimilarity = {
  id: string;
  index: number;
  label: string;
  vector: number[];
};

type PairRow = {
  leftIndex: number;
  rightIndex: number;
  leftLabel: string;
  rightLabel: string;
  cosine: number | null;
  distance: number | null;
};

export function EmbeddingPlaygroundManipulationPanel({
  hasPoints,
  activeExperiment,
  selectedPointIds,
  maxSelectedPoints,
}: EmbeddingPlaygroundManipulationPanelProps) {
  if (!hasPoints) {
    return null;
  }

  const selectedCount = selectedPointIds.length;
  const points = activeExperiment?.points ?? [];
  const embeddings = activeExperiment?.embeddings ?? null;

  const hasEmbeddings =
    Array.isArray(embeddings) && embeddings.length > 0;

  const embeddingsMatchPoints =
    !!hasEmbeddings && embeddings!.length === points.length;

  const hasAtLeastTwoSelected = selectedCount >= 2;

  const shouldExplainMissingEmbeddings =
    hasAtLeastTwoSelected &&
    !!activeExperiment &&
    (!embeddings || embeddings.length === 0);

  const shouldExplainMismatch =
    hasAtLeastTwoSelected &&
    !!activeExperiment &&
    !!embeddings &&
    embeddings.length > 0 &&
    embeddings.length !== points.length;

  let selectedPointsForSimilarity: SelectedPointForSimilarity[] = [];

  if (
    hasAtLeastTwoSelected &&
    activeExperiment &&
    hasEmbeddings &&
    embeddingsMatchPoints
  ) {
    selectedPointsForSimilarity = selectedPointIds
      .map((pointId) => {
        const index = points.findIndex((point) => point.id === pointId);

        if (index === -1 || index >= embeddings!.length) {
          return null;
        }

        const vector = embeddings![index];

        if (!Array.isArray(vector)) {
          return null;
        }

        return {
          id: pointId,
          index,
          label: points[index]?.label ?? `Item ${index + 1}`,
          vector,
        } satisfies SelectedPointForSimilarity;
      })
      .filter(
        (value): value is SelectedPointForSimilarity => value !== null,
      );
  }

  const canComputeSimilarity =
    selectedPointsForSimilarity.length >= 2 &&
    !!activeExperiment &&
    hasEmbeddings &&
    embeddingsMatchPoints;

  const pairRows: PairRow[] = [];

  if (canComputeSimilarity) {
    for (
      let left = 0;
      left < selectedPointsForSimilarity.length;
      left += 1
    ) {
      for (
        let right = left + 1;
        right < selectedPointsForSimilarity.length;
        right += 1
      ) {
        const leftPoint = selectedPointsForSimilarity[left];
        const rightPoint = selectedPointsForSimilarity[right];

        let cosine: number | null = null;
        let distance: number | null = null;

        try {
          cosine = cosineSimilarity(leftPoint.vector, rightPoint.vector);
          distance = euclideanDistance(leftPoint.vector, rightPoint.vector);
        } catch {
          // Ignore invalid vector pairs; they will render with placeholders.
        }

        pairRows.push({
          leftIndex: leftPoint.index,
          rightIndex: rightPoint.index,
          leftLabel: leftPoint.label,
          rightLabel: rightPoint.label,
          cosine,
          distance,
        });
      }
    }

    pairRows.sort((a, b) => {
      const aCosine = a.cosine;
      const bCosine = b.cosine;

      if (aCosine == null && bCosine == null) return 0;
      if (aCosine == null) return 1;
      if (bCosine == null) return -1;

      return bCosine - aCosine;
    });
  }

  const hasPairwiseSimilarity = canComputeSimilarity && pairRows.length > 0;
  const firstPair = hasPairwiseSimilarity ? pairRows[0] : null;

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
      <h2 className="mb-2 font-medium text-zinc-100">
        Selected points similarity
      </h2>
      <p className="mb-2 text-[11px] text-zinc-400">
        Click points in the 3D scene to select or deselect them. For the
        selected points, this panel shows pairwise cosine similarity and
        Euclidean distance in the full embedding space, not the 3D
        coordinates.
      </p>

      {selectedCount === 0 && (
        <p className="text-[11px] text-zinc-400">
          Select up to {maxSelectedPoints} points in the scene to compare
          their cosine similarity.
        </p>
      )}

      {selectedCount === 1 && (
        <p className="text-[11px] text-zinc-400">
          Select at least two points to see cosine similarity and distance in
          the original embedding space.
        </p>
      )}

      {shouldExplainMissingEmbeddings && (
        <p className="text-[11px] text-zinc-400">
          Embeddings are missing for this experiment. Generate embeddings
          again before inspecting similarity.
        </p>
      )}

      {shouldExplainMismatch && (
        <p className="text-[11px] text-zinc-400">
          Saved embeddings do not match the current set of points, so
          similarity cannot be computed reliably for the selected points.
        </p>
      )}

      {hasPairwiseSimilarity && (
        <div className="mt-3 space-y-3">
          {selectedPointsForSimilarity.length === 2 && firstPair && (
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <p className="mb-1 text-[11px] text-zinc-400">
                Exactly two points selected:
              </p>
              <p className="mb-1 text-[11px] text-zinc-300">
                <span className="font-mono text-zinc-100">
                  #{firstPair.leftIndex + 1} {firstPair.leftLabel}
                </span>{" "}
                and{" "}
                <span className="font-mono text-zinc-100">
                  #{firstPair.rightIndex + 1} {firstPair.rightLabel}
                </span>
              </p>
              <p className="text-[11px] text-zinc-400">
                Cosine similarity:{" "}
                <span className="font-mono text-zinc-200">
                  {formatNumber(firstPair.cosine)}
                </span>{" "}
                / Distance:{" "}
                <span className="font-mono text-zinc-200">
                  {formatNumber(firstPair.distance)}
                </span>
              </p>
            </div>
          )}

          {selectedPointsForSimilarity.length >= 3 && (
            <div className="space-y-2">
              <p className="text-[11px] text-zinc-400">
                Pairwise cosine similarity and distance for the selected
                points:
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed border-separate border-spacing-y-1 text-[11px]">
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="w-20 px-2 text-left font-normal">
                        Pair
                      </th>
                      <th className="px-2 text-left font-normal">
                        Labels
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
                    {pairRows.map((row) => (
                      <tr
                        key={`${row.leftIndex}-${row.rightIndex}`}
                        className="rounded-md border border-zinc-800 bg-zinc-950"
                      >
                        <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-500">
                          #{row.leftIndex + 1} - #{row.rightIndex + 1}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-zinc-200">
                          <span className="font-mono text-[10px] text-zinc-300">
                            {row.leftLabel}
                          </span>{" "}
                          vs{" "}
                          <span className="font-mono text-[10px] text-zinc-300">
                            {row.rightLabel}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-300">
                          {formatNumber(row.cosine)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-300">
                          {formatNumber(row.distance)}
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
  );
}
