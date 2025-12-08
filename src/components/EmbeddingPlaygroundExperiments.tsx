import type { ChangeEvent } from "react";

import type { Experiment } from "@/components/EmbeddingPlaygroundState";

type EmbeddingPlaygroundExperimentsProps = {
  experiments: Experiment[];
  activeExperiment: Experiment | null;
  onCreateExperiment: () => void;
  onDuplicateExperiment: () => void;
  onResetExperiment: () => void;
  onSelectExperiment: (experimentId: string) => void;
  onRenameActiveExperiment: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function EmbeddingPlaygroundExperiments({
  experiments,
  activeExperiment,
  onCreateExperiment,
  onDuplicateExperiment,
  onResetExperiment,
  onSelectExperiment,
  onRenameActiveExperiment,
}: EmbeddingPlaygroundExperimentsProps) {
  return (
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
            onClick={onCreateExperiment}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-100 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            New experiment
          </button>
          <button
            type="button"
            onClick={onDuplicateExperiment}
            disabled={!activeExperiment}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-200 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onResetExperiment}
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
              onClick={() => onSelectExperiment(experiment.id)}
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
              onChange={onRenameActiveExperiment}
              className="min-w-[160px] rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </label>
          {activeExperiment.embeddings && activeExperiment.embeddings.length > 0 && (
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
  );
}
