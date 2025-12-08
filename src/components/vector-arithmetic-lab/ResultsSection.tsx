import { useMemo } from "react";

import { formatNumber } from "@/components/embedding-playground/EmbeddingPlaygroundState";

import type { Neighbor } from "./types";

export type ResultsSectionProps = {
  neighbors: Neighbor[] | null;
  lastEquationTokens: string[] | null;
  lastPrediction: string | null;
};

export function ResultsSection({
  neighbors,
  lastEquationTokens,
  lastPrediction,
}: ResultsSectionProps) {
  const lastPredictionNormalized = useMemo(
    () => lastPrediction?.trim().toLowerCase() ?? "",
    [lastPrediction],
  );

  const predictionMatchState = useMemo(() => {
    if (!neighbors || neighbors.length === 0 || !lastPredictionNormalized) {
      return null;
    }

    const match = neighbors.some((neighbor) => {
      return neighbor.id.trim().toLowerCase() === lastPredictionNormalized;
    });

    return match;
  }, [neighbors, lastPredictionNormalized]);

  return (
    <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <p className="font-medium text-zinc-100">Results and neighbors</p>
        {lastEquationTokens && lastEquationTokens.length > 0 && (
          <p className="text-zinc-400">
            Last equation:{" "}
            <span className="font-mono text-zinc-200">
              {lastEquationTokens.join("  ⟶  ")}
            </span>
          </p>
        )}
      </div>

      {!neighbors || neighbors.length === 0 ? (
        <p className="text-[11px] text-zinc-400">
          Run an experiment above to see the top neighbors ranked by cosine
          similarity to the resulting vector.
        </p>
      ) : (
        <div className="space-y-2 text-[11px]">
          {predictionMatchState === true && lastPrediction && (
            <p className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-2 py-1 text-emerald-200">
              Your prediction <span className="font-mono">{lastPrediction}</span>
              {" "}
              appeared in the top {neighbors.length} neighbors.
            </p>
          )}
          {predictionMatchState === false && lastPrediction && (
            <p className="rounded-md border border-amber-500/60 bg-amber-500/10 px-2 py-1 text-amber-200">
              Your prediction <span className="font-mono">{lastPrediction}</span>
              {" "}
              did not appear in the top {neighbors.length} neighbors. This is a
              great example of where vector arithmetic can fail or behave
              unexpectedly.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-separate border-spacing-y-1 text-[11px]">
              <thead className="text-zinc-400">
                <tr>
                  <th className="w-12 px-2 text-left font-normal">#</th>
                  <th className="px-2 text-left font-normal">Token</th>
                  <th className="w-32 px-2 text-right font-normal">
                    Cosine similarity
                  </th>
                </tr>
              </thead>
              <tbody>
                {neighbors.map((neighbor, index) => {
                  const isPredicted =
                    lastPredictionNormalized &&
                    neighbor.id.trim().toLowerCase() === lastPredictionNormalized;

                  return (
                    <tr
                      key={neighbor.id + index}
                      className={[
                        "rounded-md border border-zinc-800 bg-zinc-950",
                        isPredicted
                          ? "border-emerald-500/80 bg-emerald-500/10"
                          : "",
                      ].join(" ")}
                    >
                      <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-500">
                        {index + 1}
                      </td>
                      <td className="truncate px-2 py-1 text-zinc-200">
                        {neighbor.id}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-300">
                        {formatNumber(neighbor.score)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-zinc-400">
            Try tweaking the equation coefficients, swapping tokens, or changing
            the vocabulary list to see when analogies work well and when they
            break down.
          </p>
        </div>
      )}
    </div>
  );
}
