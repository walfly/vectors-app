"use client";

import type { FormEvent } from "react";
import { useCallback, useState } from "react";

import {
  EmbeddingScene,
  type EmbeddingPoint,
} from "@/components/EmbeddingScene";

type EmbeddingsApiResponse = {
  model: string;
  embeddings: number[][];
  dimensions: number;
};

type ReductionApiResponse = {
  points: number[][];
  method: "pca" | "umap";
};

type PlaygroundStatus = "idle" | "embedding" | "reducing";

function parseInputPhrases(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n");

  if (normalized.includes("\n")) {
    return normalized
      .split("\n")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  return normalized
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}.`;

  try {
    const data = (await response.json()) as
      | {
          error?: string;
          details?: string;
          status?: string;
          model?: string;
        }
      | null;

    if (!data || typeof data.error !== "string") {
      return fallback;
    }

    if (data.status === "initializing") {
      return `${data.error} The embeddings model is still loading; try again in a few seconds.`;
    }

    if (typeof data.details === "string" && data.details.length > 0) {
      return `${data.error} (${data.details})`;
    }

    return data.error;
  } catch {
    return fallback;
  }
}

function buildEmbeddingPoints(
  reducedPoints: number[][],
  labels: string[],
): EmbeddingPoint[] {
  return reducedPoints.map((coords, index) => {
    const [x, y, z = 0] = coords;

    return {
      id: `point-${index}`,
      position: [x, y, z],
      label: labels[index] ?? `Item ${index + 1}`,
    } satisfies EmbeddingPoint;
  });
}

const INITIAL_TEXT = ["king", "queen", "man", "woman"].join("\n");

export function EmbeddingPlayground() {
  const [input, setInput] = useState(INITIAL_TEXT);
  const [status, setStatus] = useState<PlaygroundStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<EmbeddingPoint[]>([]);
  const [lastMethod, setLastMethod] = useState<"pca" | "umap" | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const phrases = parseInputPhrases(input);

      if (phrases.length === 0) {
        setError("Enter at least one word or phrase to generate embeddings.");
        return;
      }

      setError(null);
      setStatus("embedding");
      setStatusMessage(
        "Generating embeddings. This can take a few seconds on a cold start.",
      );

      let embeddingsResponse: EmbeddingsApiResponse;

      try {
        const response = await fetch("/api/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: phrases }),
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);
          setError(message);
          setStatus("idle");
          setStatusMessage(null);
          return;
        }

        embeddingsResponse = (await response.json()) as EmbeddingsApiResponse;
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unexpected error while calling /api/embeddings.",
        );
        setStatus("idle");
        setStatusMessage(null);
        return;
      }

      setLastModel(embeddingsResponse.model);
      setStatus("reducing");
      setStatusMessage("Reducing embeddings to 3D for visualization...");

      try {
        const response = await fetch("/api/reduce", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vectors: embeddingsResponse.embeddings,
            method: "pca",
            dimensions: 3,
          }),
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);
          setError(message);
          setStatus("idle");
          setStatusMessage(null);
          return;
        }

        const reduced = (await response.json()) as ReductionApiResponse;

        setPoints(buildEmbeddingPoints(reduced.points, phrases));
        setLastMethod(reduced.method);
        setStatus("idle");
        setStatusMessage(null);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unexpected error while calling /api/reduce.",
        );
        setStatus("idle");
        setStatusMessage(null);
      }
    },
    [input],
  );

  const hasPoints = points.length > 0;
  const isSubmitting = status !== "idle";

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-zinc-100">
            Text inputs
          </span>
          <span className="text-xs text-zinc-400">
            Enter one word or short phrase per line. For a single line, you can
            separate multiple entries with commas. The playground will generate
            embeddings for each entry and project them into 3D.
          </span>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={5}
            className="mt-1 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 shadow-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            spellCheck={false}
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
          <div>
            {hasPoints ? (
              <span>
                Showing {points.length} point{points.length === 1 ? "" : "s"}
                {lastMethod ? ` reduced with ${lastMethod.toUpperCase()}` : ""}
                {lastModel ? ` from ${lastModel}` : ""}.
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

        {error && (
          <p className="text-xs font-medium text-red-400">{error}</p>
        )}
      </form>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm md:p-6">
        <EmbeddingScene
          points={points}
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

      {hasPoints && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
          <h2 className="mb-2 font-medium text-zinc-100">Inputs</h2>
          <ul className="grid gap-1 sm:grid-cols-2 md:grid-cols-3">
            {points.map((point, index) => (
              <li key={point.id} className="truncate text-zinc-400">
                <span className="font-mono text-[10px] text-zinc-500">
                  {index + 1}.
                </span>{" "}
                <span>{point.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
