import { EmbeddingScene } from "@/components/EmbeddingScene";
import type { EmbeddingPoint } from "@/components/EmbeddingScene";

type EmbeddingPlaygroundSceneSectionProps = {
  points: EmbeddingPoint[];
  manipulationMode: boolean;
  hasPoints: boolean;
  selectedPointId: string | null;
  onToggleManipulationMode: () => void;
  onPointSelect: (pointId: string | null) => void;
};

export function EmbeddingPlaygroundSceneSection({
  points,
  manipulationMode,
  hasPoints,
  selectedPointId,
  onToggleManipulationMode,
  onPointSelect,
}: EmbeddingPlaygroundSceneSectionProps) {
  return (
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
          onClick={onToggleManipulationMode}
          disabled={!hasPoints}
          className={[
            "rounded-md border px-3 py-1.5 text-[11px] font-medium shadow-sm transition",
            manipulationMode
              ? "border-emerald-400 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300 hover:bg-emerald-500/20"
              : "border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900",
            !hasPoints ? "cursor-not-allowed opacity-50" : "",
          ].join(" ")}
        >
          {manipulationMode ? "Manipulation mode: On" : "Manipulation mode: Off"}
        </button>
      </div>

      <EmbeddingScene
        points={points}
        selectedPointId={manipulationMode ? selectedPointId : null}
        onPointSelect={onPointSelect}
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
  );
}
