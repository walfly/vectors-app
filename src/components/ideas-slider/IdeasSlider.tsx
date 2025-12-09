"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { slerp } from "@/lib/vectors";
import {
  formatNumber,
  readErrorMessage,
  type EmbeddingsApiResponse,
} from "@/components/embedding-playground/EmbeddingPlaygroundState";

type IdeasSliderStatus = "idle" | "embedding" | "searching";

type WikipediaNeighbor = {
  title: string;
  score: number;
};

const DEFAULT_LEFT_IDEA = "A short story about cats.";
const DEFAULT_RIGHT_IDEA = "A short story about dogs.";

const DEFAULT_NEIGHBOR_COUNT = 5;
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;

type EndpointEmbeddings = {
  left: number[];
  right: number[];
};

export function IdeasSlider() {
  const [leftInput, setLeftInput] = useState(DEFAULT_LEFT_IDEA);
  const [rightInput, setRightInput] = useState(DEFAULT_RIGHT_IDEA);

  const [status, setStatus] = useState<IdeasSliderStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [embeddings, setEmbeddings] = useState<EndpointEmbeddings | null>(
    null,
  );
  const [position, setPosition] = useState<number>(50);
  const [neighbors, setNeighbors] = useState<WikipediaNeighbor[] | null>(null);

  const requestIdRef = useRef(0);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const hasEmbeddings = embeddings !== null;
  const sliderT = (position - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);

  const resetSliderState = useCallback(() => {
    setEmbeddings(null);
    setNeighbors(null);
    setPosition(50);
    setError(null);
    setStatus("idle");
    setStatusMessage(null);
    requestIdRef.current += 1;
  }, []);

  const handleResetInputs = useCallback(() => {
    setLeftInput(DEFAULT_LEFT_IDEA);
    setRightInput(DEFAULT_RIGHT_IDEA);
    resetSliderState();
  }, [resetSliderState]);

  const handleRunExperiment = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const left = leftInput.trim();
      const right = rightInput.trim();

      if (!left || !right) {
        setError(
          "Enter a sentence or short phrase for both ideas before running the slider.",
        );
        return;
      }

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }

      requestIdRef.current += 1;
      setStatus("embedding");
      setStatusMessage(
        "Embedding the two ideas. This can take a few seconds on a cold start.",
      );
      setError(null);
      setNeighbors(null);
      setEmbeddings(null);

      let embeddingsResponse: EmbeddingsApiResponse;

      try {
        const response = await fetch("/api/embeddings", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: [left, right] }),
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

      if (!Array.isArray(embeddingsResponse.embeddings)) {
        setError(
          "Unexpected response from /api/embeddings: missing 'embeddings' array.",
        );
        setStatus("idle");
        setStatusMessage(null);
        return;
      }

      if (embeddingsResponse.embeddings.length !== 2) {
        setError(
          "Unexpected response from /api/embeddings: expected embeddings for exactly two inputs.",
        );
        setStatus("idle");
        setStatusMessage(null);
        return;
      }

      const [leftEmbedding, rightEmbedding] = embeddingsResponse.embeddings;

      if (
        !Array.isArray(leftEmbedding) ||
        !Array.isArray(rightEmbedding) ||
        leftEmbedding.length === 0 ||
        rightEmbedding.length === 0 ||
        leftEmbedding.length !== rightEmbedding.length
      ) {
        setError(
          "Unexpected response from /api/embeddings: embedding vectors are malformed.",
        );
        setStatus("idle");
        setStatusMessage(null);
        return;
      }

      setEmbeddings({
        left: leftEmbedding,
        right: rightEmbedding,
      });
      setPosition(50);
      setStatus("idle");
      setStatusMessage(null);
    },
    [leftInput, rightInput],
  );

  const searchAt = useCallback(
    async (t: number) => {
      if (!embeddings) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setStatus("searching");
      setStatusMessage("Searching Wikipedia title embeddings...");
      setError(null);

      const query = slerp(embeddings.left, embeddings.right, t);

      try {
        const response = await fetch("/api/wikipedia-nearest", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, k: DEFAULT_NEIGHBOR_COUNT }),
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);

          if (requestIdRef.current === requestId) {
            setError(message);
            setStatus("idle");
            setStatusMessage(null);
            setNeighbors(null);
          }

          return;
        }

        const json = (await response.json()) as {
          neighbors?: { title?: unknown; score?: unknown }[];
        };

        const rawNeighbors = Array.isArray(json.neighbors)
          ? json.neighbors
          : [];

        const mappedNeighbors: WikipediaNeighbor[] = rawNeighbors
          .map((item) => {
            const title =
              item && typeof item.title === "string" ? item.title : null;
            const score =
              typeof item.score === "number" &&
              Number.isFinite(item.score)
                ? item.score
                : null;

            if (!title || score === null) {
              return null;
            }

            return { title, score } satisfies WikipediaNeighbor;
          })
          .filter((neighbor): neighbor is WikipediaNeighbor => neighbor !== null);

        if (requestIdRef.current === requestId) {
          setNeighbors(mappedNeighbors);
          setStatus("idle");
          setStatusMessage(null);
        }
      } catch (fetchError) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unexpected error while calling /api/wikipedia-nearest.",
        );
        setStatus("idle");
        setStatusMessage(null);
      }
    },
    [embeddings],
  );

  useEffect(() => {
    if (!embeddings) {
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    const t = (position - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);

    debounceTimeoutRef.current = setTimeout(() => {
      void searchAt(t);
    }, 250);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [embeddings, position, searchAt]);

  const isBusy = status !== "idle";

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-300 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-zinc-100">Ideas slider</h3>
          <p className="max-w-xl text-[11px] text-zinc-400">
            Embed two ideas, then scrub along the slider to interpolate between
            them in embedding space and see which Wikipedia titles land closest
            to each blended point.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetInputs}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          Reset inputs
        </button>
      </div>

      <form onSubmit={handleRunExperiment} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-zinc-100">
              Idea A
            </label>
            <p className="text-[11px] text-zinc-400">
              This idea anchors the left side of the slider.
            </p>
            <textarea
              value={leftInput}
              onChange={(event) => setLeftInput(event.target.value)}
              rows={3}
              className="min-h-[72px] w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-zinc-100">
              Idea B
            </label>
            <p className="text-[11px] text-zinc-400">
              This idea anchors the right side of the slider.
            </p>
            <textarea
              value={rightInput}
              onChange={(event) => setRightInput(event.target.value)}
              rows={3}
              className="min-h-[72px] w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-zinc-100">
              2. Move along the slider to blend between ideas
            </p>
            <p className="text-[10px] text-zinc-400">
              Blend factor t = {formatNumber(sliderT)} (0 = Idea A, 1 = Idea B)
            </p>
          </div>

          <div className="space-y-1">
            <input
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              value={position}
              disabled={!hasEmbeddings || isBusy}
              onChange={(event) =>
                setPosition(Number.parseInt(event.target.value, 10) || 0)
              }
              className="block w-full cursor-pointer accent-amber-300 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>Idea A</span>
              <span>Idea B</span>
            </div>
          </div>

          <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/80 p-2">
            {!neighbors || neighbors.length === 0 ? (
              <p className="text-[11px] text-zinc-400">
                Run the experiment, then move the slider to see the top
                Wikipedia titles nearest to each blended vector.
              </p>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {neighbors.map((neighbor, index) => (
                  <li
                    key={`${neighbor.title}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="w-6 text-right font-mono text-[10px] text-zinc-500">
                        {index + 1}.
                      </span>
                      <span className="truncate text-zinc-200">
                        {neighbor.title}
                      </span>
                    </div>
                    <span className="ml-2 whitespace-nowrap font-mono text-[10px] text-zinc-300">
                      {formatNumber(neighbor.score)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-[11px] text-zinc-400">
            <p>
              1. Embed both ideas, then explore how their nearest neighbors
              change as you move between them in embedding space.
            </p>
            {statusMessage && <p>{statusMessage}</p>}
            {error && <p className="font-medium text-red-400">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="inline-flex items-center justify-center rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? "Running..." : "Run experiment"}
          </button>
        </div>
      </form>
    </section>
  );
}
