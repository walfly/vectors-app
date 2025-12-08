import { formatNumber } from "@/components/EmbeddingPlaygroundState";
import type { Experiment } from "@/components/EmbeddingPlaygroundState";
import type { EmbeddingPoint } from "@/components/EmbeddingScene";

type Neighbor = {
  index: number;
  label: string;
  cosine: number;
  distance: number;
};

type EmbeddingPlaygroundManipulationPanelProps = {
  manipulationMode: boolean;
  hasPoints: boolean;
  activeExperiment: Experiment | null;
  selectedPointIndex: number;
  selectedPoint: EmbeddingPoint | null;
  selectedPointNeighbors: Neighbor[];
  onNudgeSelectedPoint: (axis: 0 | 1 | 2, delta: number) => void;
  onResetSelectedPointPosition: () => void;
};

export function EmbeddingPlaygroundManipulationPanel({
  manipulationMode,
  hasPoints,
  activeExperiment,
  selectedPointIndex,
  selectedPoint,
  selectedPointNeighbors,
  onNudgeSelectedPoint,
  onResetSelectedPointPosition,
}: EmbeddingPlaygroundManipulationPanelProps) {
  if (!manipulationMode || !hasPoints) {
    return null;
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
      <h2 className="mb-2 font-medium text-zinc-100">Manipulation tools</h2>
      {!activeExperiment?.embeddings || selectedPointIndex < 0 ? (
        <p className="text-[11px] text-zinc-400">
          Select a point in the scene to inspect its coordinates and nearest
          neighbors.
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
                  {selectedPoint?.label ?? `Item ${selectedPointIndex + 1}`}
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
                        onNudgeSelectedPoint(axisIndex as 0 | 1 | 2, -0.2)
                      }
                      className="h-6 w-6 rounded border border-zinc-700 text-[10px] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onNudgeSelectedPoint(axisIndex as 0 | 1 | 2, 0.2)
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
                onClick={onResetSelectedPointPosition}
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
                      <th className="w-12 px-2 text-left font-normal">#</th>
                      <th className="px-2 text-left font-normal">Label</th>
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
  );
}
