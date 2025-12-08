import type { ChangeEvent } from "react";

export type PredictionSectionProps = {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function PredictionSection({
  value,
  onChange,
}: PredictionSectionProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="mb-1 text-[11px] font-medium text-zinc-100">
        2. Predict the result
      </p>
      <p className="mb-2 text-[11px] text-zinc-400">
        Before we reveal the neighbors, make a guess about which token should
        end up closest to the result vector.
      </p>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder="e.g., queen"
        className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
      />
    </div>
  );
}
