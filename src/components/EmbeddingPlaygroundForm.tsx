import type { ChangeEvent, FormEvent } from "react";

import type { Experiment } from "@/components/EmbeddingPlaygroundState";

type EmbeddingPlaygroundFormProps = {
  activeExperiment: Experiment | null;
  activeInput: string;
  parsedInputPhrases: string[];
  hasPoints: boolean;
  activePointsCount: number;
  isSubmitting: boolean;
  statusMessage: string | null;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onAddPhrase: () => void;
  onPhraseEdit: (index: number, value: string) => void;
  onPhraseRemove: (index: number) => void;
};

export function EmbeddingPlaygroundForm({
  activeExperiment,
  activeInput,
  parsedInputPhrases,
  hasPoints,
  activePointsCount,
  isSubmitting,
  statusMessage,
  error,
  onSubmit,
  onInputChange,
  onAddPhrase,
  onPhraseEdit,
  onPhraseRemove,
}: EmbeddingPlaygroundFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-zinc-100">Text inputs</span>
        <span className="text-xs text-zinc-400">
          Enter one word or short phrase per line. Use experiments to explore
          variations without losing your previous runs.
        </span>
        <textarea
          value={activeInput}
          onChange={onInputChange}
          rows={5}
          className="mt-1 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 shadow-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          spellCheck={false}
        />
      </label>

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
            No entries yet. Start typing above, or use the sample starting
            text.
          </p>
        ) : (
          <ul className="space-y-1">
            {parsedInputPhrases.map((phrase, index) => (
              <li
                key={`${index}-${phrase}`}
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
