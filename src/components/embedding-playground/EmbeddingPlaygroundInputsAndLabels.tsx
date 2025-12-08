import type { EmbeddingPoint } from "./EmbeddingScene";

type EmbeddingPlaygroundInputsAndLabelsProps = {
  hasPoints: boolean;
  activePoints: EmbeddingPoint[];
  onPointLabelChange: (pointId: string, label: string) => void;
};

export function EmbeddingPlaygroundInputsAndLabels({
  hasPoints,
  activePoints,
  onPointLabelChange,
}: EmbeddingPlaygroundInputsAndLabelsProps) {
  if (!hasPoints) {
    return null;
  }

  return (
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
                onPointLabelChange(point.id, event.target.value)
              }
              className="min-w-0 flex-1 truncate rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
