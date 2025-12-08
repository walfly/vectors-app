import type { ChangeEvent } from "react";

export type VocabularySectionProps = {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onLoadFromPlayground: () => void;
};

export function VocabularySection({
  value,
  onChange,
  onLoadFromPlayground,
}: VocabularySectionProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-zinc-100">
            Vocabulary to search over
          </p>
          <p className="text-[11px] text-zinc-400">
            These tokens form the candidate set for nearest neighbors. Use one
            token per line or comma-separated.
          </p>
        </div>
        <button
          type="button"
          onClick={onLoadFromPlayground}
          className="sm:ml-auto rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-200 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-900"
        >
          Use playground inputs
        </button>
      </div>
      <textarea
        value={value}
        onChange={onChange}
        rows={6}
        className="h-full min-h-[120px] w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
      />
    </div>
  );
}
