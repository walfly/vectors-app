export type RunSectionProps = {
  statusMessage: string | null;
  error: string | null;
  isSubmitting: boolean;
};

export function RunSection({
  statusMessage,
  error,
  isSubmitting,
}: RunSectionProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1 text-[11px] text-zinc-400">
        <p>
          3. Run the lab to compute the weighted sum and search for the nearest
          neighbors in your vocabulary.
        </p>
        {statusMessage && <p>{statusMessage}</p>}
        {error && <p className="font-medium text-red-400">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Running experiment..." : "Run experiment"}
      </button>
    </div>
  );
}
