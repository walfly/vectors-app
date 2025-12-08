import { EmbeddingScene } from "@/components/EmbeddingScene";
import type { EmbeddingPoint } from "@/components/EmbeddingScene";

type EmbeddingPlaygroundSceneSectionProps = {
  points: EmbeddingPoint[];
  hasPoints: boolean;
  selectedPointIds: string[];
  onPointSelect: (pointId: string) => void;
  maxSelectedPoints: number;
};

export function EmbeddingPlaygroundSceneSection({
  points,
  hasPoints,
  selectedPointIds,
  onPointSelect,
  maxSelectedPoints,
}: EmbeddingPlaygroundSceneSectionProps) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-300">
        <div className="space-y-1">
          <h2 className="font-medium text-zinc-100">Embedding scene</h2>
          <p className="max-w-md text-[11px] text-zinc-400">
            Hover to inspect labels, and click points to select or deselect
            them. Selected points will be highlighted in the scene and used in
            the similarity panel below. You can select up to {maxSelectedPoints}
            {" "}
            points at once.
          </p>
        </div>
      </div>

      <EmbeddingScene
        points={points}
        selectedPointIds={hasPoints ? selectedPointIds : []}
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
