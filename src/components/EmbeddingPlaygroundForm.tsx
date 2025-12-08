import type { FormEvent } from "react";

import type { Experiment } from "@/components/EmbeddingPlaygroundState";

type EmbeddingPlaygroundFormProps = {
  activeExperiment: Experiment | null;
  parsedInputPhrases: string[];
  hasPoints: boolean;
  activePointsCount: number;
  isSubmitting: boolean;
  statusMessage: string | null;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAddPhrase: () => void;
  onPhraseEdit: (index: number, value: string) => void;
  onPhraseRemove: (index: number) => void;
};

export function EmbeddingPlaygroundForm({
  activeExperiment,
  parsedInputPhrases,
  hasPoints,
  activePointsCount,
  isSubmitting,
  statusMessage,
  error,
  onSubmit,
  onAddPhrase,
  onPhraseEdit,
  onPhraseRemove,
}: EmbeddingPlaygroundFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-zinc-100">Text inputs</span>
        <span className="text-xs text-zinc-400">
          Manage your inputs as a list of structured entries. Each row becomes
          one embedding input, and you can add, edit, or remove entries below.
        </span>
      </div>

      <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-medium text-zinc-100">Entries</p>
          <button
            type="button"
            onClick={onAddPhrase}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-100 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Add entry
          </button>
        </div>
        {parsedInputPhrases.length === 0 ? (
          <p className="text-[11px] text-zinc-500">
            No entries yet. Use 
            <span className="font-medium text-zinc-300"> Add entry </span>
            to start building your list.
          </p>
        ) : (
          <ul className="space-y-1">
            {parsedInputPhrases.map((phrase, index) => (
              <li
                key={index}
                className="flex items-center gap-2 text-[11px]"
              >
                <span className="w-5 text-right font-mono text-[10px] text-zinc-500">
                  {index + 1}.
                </span>
                <input
                  type="text"
                  value={phrase}
                  onChange={(event) =>
                    onPhraseEdit(index, event.target.value)
                  }
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => onPhraseRemove(index)}
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
              Showing {activePointsCount} point
              {activePointsCount === 1 ? "" : "s"}
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

      {error && <p className="text-xs font-medium text-red-400">{error}</p>}
    </form>
  );
}
