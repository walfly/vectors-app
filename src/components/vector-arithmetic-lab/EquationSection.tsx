import type { ChangeEvent } from "react";

import type { EquationTerm } from "./types";

export type EquationSectionProps = {
  terms: EquationTerm[];
  equationPreview: string;
  onTermWeightChange: (id: string, event: ChangeEvent<HTMLInputElement>) => void;
  onTermTokenChange: (id: string, event: ChangeEvent<HTMLInputElement>) => void;
  onAddTerm: () => void;
  onRemoveTerm: (id: string) => void;
};

export function EquationSection({
  terms,
  equationPreview,
  onTermWeightChange,
  onTermTokenChange,
  onAddTerm,
  onRemoveTerm,
}: EquationSectionProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-zinc-100">
            1. Build a word equation
          </p>
          <p className="text-[11px] text-zinc-400">
            Each row is a term of the form <code>(weight) token</code>.
            Positive weights add a vector; negative weights subtract it.
          </p>
        </div>
      </div>

      <p className="mb-2 rounded-md bg-zinc-950 px-2 py-1.5 font-mono text-[11px] text-zinc-200">
        {equationPreview}
      </p>

      <ul className="space-y-1">
        {terms.map((term) => (
          <li key={term.id} className="flex items-center gap-2 text-[11px]">
            <input
              type="number"
              value={term.weight}
              onChange={(event) => onTermWeightChange(term.id, event)}
              step={1}
              className="w-16 rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-right font-mono text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
            <input
              type="text"
              value={term.token}
              onChange={(event) => onTermTokenChange(term.id, event)}
              placeholder="token (e.g., king)"
              className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
            <button
              type="button"
              onClick={() => onRemoveTerm(term.id)}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-300 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-900"
            >
              Remove
            </button>
          </li>
        ))}
        <li className="pt-1">
          <button
            type="button"
            onClick={onAddTerm}
            className="rounded-md border border-dashed border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-200 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-900"
          >
            Add term
          </button>
        </li>
      </ul>
    </div>
  );
}
