"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";

import {
  formatNumber,
  loadInitialPlaygroundState,
  parseInputPhrases,
  readErrorMessage,
  type EmbeddingsApiResponse,
} from "@/components/EmbeddingPlaygroundState";

type EquationTerm = {
  id: string;
  token: string;
  weight: number;
};

type Neighbor = {
  id: string;
  score: number;
};

type LabStatus = "idle" | "embedding" | "arithmetic" | "nearest";

const DEFAULT_EXAMPLE_TERMS: EquationTerm[] = [
  { id: "term-1", token: "king", weight: 1 },
  { id: "term-2", token: "man", weight: -1 },
  { id: "term-3", token: "woman", weight: 1 },
];

const DEFAULT_VOCAB_INPUT = [
  "king",
  "queen",
  "man",
  "woman",
  "boy",
  "girl",
  "prince",
  "princess",
].join("\n");

const DEFAULT_PREDICTION = "queen";

const DEFAULT_NEIGHBOR_COUNT = 8;

function normalizeToken(raw: string): string {
  return raw.trim();
}

/**
* Validates that the arithmetic API returned a non-empty vector of finite numbers.
* The API contract does not allow empty vectors or non-finite numeric values.
*/
function isValidResultVector(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  return value.every((element) => {
    return typeof element === "number" && Number.isFinite(element);
  });
}

function buildEquationPreview(terms: EquationTerm[]): string {
  const activeTerms = terms.filter((term) => {
    return normalizeToken(term.token).length > 0 && Number.isFinite(term.weight);
  });

  if (activeTerms.length === 0) {
    return "Add at least one term to build an equation.";
  }

  const pieces = activeTerms.map((term) => {
    const token = normalizeToken(term.token);
    const sign = term.weight >= 0 ? `+${term.weight}` : String(term.weight);
    return `(${sign}) ${token}`;
  });

  return `${pieces.join(" + ")} = ?`;
}

export function VectorArithmeticLab() {
  const [terms, setTerms] = useState<EquationTerm[]>(() =>
    DEFAULT_EXAMPLE_TERMS.map((term, index) => ({
      ...term,
      id: `term-${index + 1}`,
    })),
  );
  const [vocabularyInput, setVocabularyInput] = useState(DEFAULT_VOCAB_INPUT);
  const [prediction, setPrediction] = useState(DEFAULT_PREDICTION);

  const [status, setStatus] = useState<LabStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [neighbors, setNeighbors] = useState<Neighbor[] | null>(null);
  const [lastPrediction, setLastPrediction] = useState<string | null>(null);
  const [lastEquationTokens, setLastEquationTokens] = useState<string[] | null>(
    null,
  );

  const equationPreview = useMemo(
    () => buildEquationPreview(terms),
    [terms],
  );

  const isSubmitting = status !== "idle";

  const lastPredictionNormalized = useMemo(
    () => lastPrediction?.trim().toLowerCase() ?? "",
    [lastPrediction],
  );

  const predictionMatchState = useMemo(() => {
    if (!neighbors || neighbors.length === 0 || !lastPredictionNormalized) {
      return null;
    }

    const match = neighbors.some((neighbor) => {
      return neighbor.id.trim().toLowerCase() === lastPredictionNormalized;
    });

    return match;
  }, [neighbors, lastPredictionNormalized]);

  const handleTermTokenChange = useCallback(
    (id: string, event: ChangeEvent<HTMLInputElement>) => {
      const nextToken = event.target.value;

      setTerms((current) =>
        current.map((term) =>
          term.id === id
            ? {
                ...term,
                token: nextToken,
              }
            : term,
        ),
      );
    },
    [],
  );

  const handleTermWeightChange = useCallback(
    (id: string, event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const parsed = Number.parseFloat(raw);

      setTerms((current) =>
        current.map((term) =>
          term.id === id
            ? {
                ...term,
                weight: Number.isFinite(parsed) ? parsed : 0,
              }
            : term,
        ),
      );
    },
    [],
  );

  const handleAddTerm = useCallback(() => {
    setTerms((current) => {
      const nextIndex = current.length + 1;

      return [
        ...current,
        {
          id: `term-${Date.now()}-${nextIndex}`,
          token: "",
          weight: 1,
        },
      ];
    });
  }, []);

  const handleRemoveTerm = useCallback((id: string) => {
    setTerms((current) => current.filter((term) => term.id !== id));
  }, []);

  const handleResetToExample = useCallback(() => {
    setTerms(
      DEFAULT_EXAMPLE_TERMS.map((term, index) => ({
        ...term,
        id: `term-example-${Date.now()}-${index + 1}`,
      })),
    );
    setVocabularyInput(DEFAULT_VOCAB_INPUT);
    setPrediction(DEFAULT_PREDICTION);
    setNeighbors(null);
    setLastPrediction(null);
    setLastEquationTokens(null);
    setError(null);
    setStatus("idle");
    setStatusMessage(null);
  }, []);

  const handleVocabularyChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setVocabularyInput(event.target.value);
    },
    [],
  );

  const handlePredictionChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setPrediction(event.target.value);
    },
    [],
  );

  const handleLoadFromPlayground = useCallback(() => {
    const state = loadInitialPlaygroundState();
    const { experiments, activeExperimentId } = state;

    const activeExperiment =
      experiments.find((experiment) => experiment.id === activeExperimentId) ??
      experiments[0];

    if (!activeExperiment) {
      return;
    }

    const tokens = parseInputPhrases(activeExperiment.input);

    if (tokens.length === 0) {
      setError(
        "The embedding playground does not have any saved inputs yet. Add a few words there first.",
      );
      return;
    }

    const seen = new Set<string>();
    const uniqueTokens: string[] = [];

    for (const token of tokens) {
      const normalized = normalizeToken(token);

      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      uniqueTokens.push(normalized);
    }

    if (uniqueTokens.length === 0) {
      setError(
        "The embedding playground inputs are empty after normalization. Try editing them before importing.",
      );
      return;
    }

    setTerms((current) => {
      const next: EquationTerm[] = uniqueTokens.slice(0, 3).map((token, index) => ({
        id: `term-playground-${Date.now()}-${index + 1}`,
        token,
        // Use a simple +1, -1, +1 pattern when three tokens are available.
        weight: index === 1 ? -1 : 1,
      }));

      return next.length > 0 ? next : current;
    });

    setVocabularyInput(uniqueTokens.join("\n"));
    setError(null);
  }, []);

  const handleRunExperiment = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const normalizedTerms = terms
        .map((term) => ({
          ...term,
          token: normalizeToken(term.token),
        }))
        .filter((term) => term.token.length > 0 && Number.isFinite(term.weight));

      if (normalizedTerms.length === 0) {
        setError(
          "Add at least one term with a non-empty token and numeric coefficient.",
        );
        return;
      }

      const vocabularyTokens = parseInputPhrases(vocabularyInput)
        .map((token) => normalizeToken(token))
        .filter((token) => token.length > 0);

      if (vocabularyTokens.length === 0) {
        setError(
          "Add at least one vocabulary token (for example: queen, princess, capital cities).",
        );
        return;
      }

      setError(null);
      setNeighbors(null);
      setLastPrediction(null);
      setLastEquationTokens(null);

      const allTokens: string[] = [];
      const seen = new Set<string>();

      for (const term of normalizedTerms) {
        const key = term.token.toLowerCase();

        if (!seen.has(key)) {
          seen.add(key);
          allTokens.push(term.token);
        }
      }

      for (const token of vocabularyTokens) {
        const key = token.toLowerCase();

        if (!seen.has(key)) {
          seen.add(key);
          allTokens.push(token);
        }
      }

      if (allTokens.length === 0) {
        setError("No valid tokens found after normalization.");
        return;
      }

      setStatus("embedding");
      setStatusMessage("Embedding equation tokens and vocabulary...");

      let embeddingsResponse: EmbeddingsApiResponse;

      try {
        const response = await fetch("/api/embeddings", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: allTokens }),
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

      if (
        !embeddingsResponse.embeddings ||
        embeddingsResponse.embeddings.length !== allTokens.length
      ) {
        setError(
          "Unexpected response from /api/embeddings: token and embedding counts do not match.",
        );
        setStatus("idle");
        setStatusMessage(null);
        return;
      }

      const tokenVectors = new Map<string, number[]>();

      for (let index = 0; index < allTokens.length; index += 1) {
        const token = allTokens[index];
        const vector = embeddingsResponse.embeddings[index];

        if (!Array.isArray(vector)) {
          continue;
        }

        tokenVectors.set(token.toLowerCase(), vector);
      }

      const missingForTerms: string[] = [];

      const arithmeticTerms = normalizedTerms.map((term) => {
        const vector = tokenVectors.get(term.token.toLowerCase());

        if (!vector) {
          missingForTerms.push(term.token);
        }

        return {
          id: term.token,
          vector,
          weight: term.weight,
        };
      });

      if (missingForTerms.length > 0) {
        setError(
          `Missing embeddings for equation tokens: ${missingForTerms.join(", ")}.`,
        );
        setStatus("idle");
        setStatusMessage(null);
        return;
      }

      setStatus("arithmetic");
      setStatusMessage("Computing the weighted result vector for your equation...");

      let arithmeticResult: { result: number[] };

      try {
        const response = await fetch("/api/arithmetic", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            terms: arithmeticTerms.map((term) => ({
              id: term.id,
              vector: term.vector,
              weight: term.weight,
            })),
          }),
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);
          setError(message);
          setStatus("idle");
          setStatusMessage(null);
          return;
        }

        const json = (await response.json()) as {
          result?: unknown;
        };

        if (!isValidResultVector(json.result)) {
          setError("/api/arithmetic returned a malformed result vector.");
          setStatus("idle");
          setStatusMessage(null);
          return;
        }

        arithmeticResult = { result: json.result };
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unexpected error while calling /api/arithmetic.",
        );
        setStatus("idle");
        setStatusMessage(null);
        return;
      }

      const vocabularyCandidates = vocabularyTokens
        .map((token) => {
          const vector = tokenVectors.get(token.toLowerCase());

          if (!vector) {
            return null;
          }

          return {
            id: token,
            vector,
          };
        })
        .filter((candidate): candidate is { id: string; vector: number[] } => {
          return candidate !== null;
        });

      if (vocabularyCandidates.length === 0) {
        setError(
          "No valid vocabulary candidates found with embeddings. Try adjusting your vocabulary list.",
        );
        setStatus("idle");
        setStatusMessage(null);
        return;
      }

      setStatus("nearest");
      setStatusMessage("Searching for nearest neighbors within your vocabulary...");

      try {
        const response = await fetch("/api/nearest", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: arithmeticResult.result,
            candidates: vocabularyCandidates,
            k: DEFAULT_NEIGHBOR_COUNT,
          }),
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);
          setError(message);
          setStatus("idle");
          setStatusMessage(null);
          return;
        }

        const json = (await response.json()) as {
          neighbors?: Neighbor[];
        };

        const nextNeighbors = Array.isArray(json.neighbors)
          ? json.neighbors
          : [];

        setNeighbors(nextNeighbors);
        setLastPrediction(prediction);
        setLastEquationTokens(normalizedTerms.map((term) => term.token));
        setStatus("idle");
        setStatusMessage(null);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unexpected error while calling /api/nearest.",
        );
        setStatus("idle");
        setStatusMessage(null);
      }
    },
    [prediction, terms, vocabularyInput],
  );

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-300 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-zinc-100">
            Vector Arithmetic Laboratory
          </h2>
          <p className="max-w-xl text-[11px] text-zinc-400">
            Build word equations like <code>king - man + woman = ?</code>,
            predict the answer, and then see what the embedding space thinks by
            looking at the nearest neighbors.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetToExample}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          Load example equation
        </button>
      </div>

      <form onSubmit={handleRunExperiment} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
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
                <li
                  key={term.id}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <input
                    type="number"
                    value={term.weight}
                    onChange={(event) =>
                      handleTermWeightChange(term.id, event)
                    }
                    step={1}
                    className="w-16 rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-right font-mono text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                  <input
                    type="text"
                    value={term.token}
                    onChange={(event) =>
                      handleTermTokenChange(term.id, event)
                    }
                    placeholder="token (e.g., king)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveTerm(term.id)}
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-300 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-900"
                  >
                    Remove
                  </button>
                </li>
              ))}
              <li className="pt-1">
                <button
                  type="button"
                  onClick={handleAddTerm}
                  className="rounded-md border border-dashed border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-200 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-900"
                >
                  Add term
                </button>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-[11px] font-medium text-zinc-100">
                    Vocabulary to search over
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    These tokens form the candidate set for nearest neighbors.
                    Use one token per line or comma-separated.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLoadFromPlayground}
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-200 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  Use playground inputs
                </button>
              </div>
              <textarea
                value={vocabularyInput}
                onChange={handleVocabularyChange}
                rows={6}
                className="h-full min-h-[120px] w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              />
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="mb-1 text-[11px] font-medium text-zinc-100">
                2. Predict the result
              </p>
              <p className="mb-2 text-[11px] text-zinc-400">
                Before we reveal the neighbors, make a guess about which token
                should end up closest to the result vector.
              </p>
              <input
                type="text"
                value={prediction}
                onChange={handlePredictionChange}
                placeholder="e.g., queen"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-[11px] text-zinc-400">
            <p>
              3. Run the lab to compute the weighted sum and search for the
              nearest neighbors in your vocabulary.
            </p>
            {statusMessage && <p>{statusMessage}</p>}
            {error && (
              <p className="font-medium text-red-400">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Running experiment..." : "Run experiment"}
          </button>
        </div>
      </form>

      <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <p className="font-medium text-zinc-100">Results and neighbors</p>
          {lastEquationTokens && lastEquationTokens.length > 0 && (
            <p className="text-zinc-400">
              Last equation:{" "}
              <span className="font-mono text-zinc-200">
                {lastEquationTokens.join("  ⟶  ")}
              </span>
            </p>
          )}
        </div>

        {!neighbors || neighbors.length === 0 ? (
          <p className="text-[11px] text-zinc-400">
            Run an experiment above to see the top neighbors ranked by cosine
            similarity to the resulting vector.
          </p>
        ) : (
          <div className="space-y-2 text-[11px]">
            {predictionMatchState === true && lastPrediction && (
              <p className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                Your prediction <span className="font-mono">{lastPrediction}</span>
                {" "}
                appeared in the top {neighbors.length} neighbors.
              </p>
            )}
            {predictionMatchState === false && lastPrediction && (
              <p className="rounded-md border border-amber-500/60 bg-amber-500/10 px-2 py-1 text-amber-200">
                Your prediction <span className="font-mono">{lastPrediction}</span>
                {" "}
                did not appear in the top {neighbors.length} neighbors. This is
                a great example of where vector arithmetic can fail or behave
                unexpectedly.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed border-separate border-spacing-y-1 text-[11px]">
                <thead className="text-zinc-400">
                  <tr>
                    <th className="w-12 px-2 text-left font-normal">#</th>
                    <th className="px-2 text-left font-normal">Token</th>
                    <th className="w-32 px-2 text-right font-normal">
                      Cosine similarity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {neighbors.map((neighbor, index) => {
                    const isPredicted =
                      lastPredictionNormalized &&
                      neighbor.id.trim().toLowerCase() ===
                        lastPredictionNormalized;

                    return (
                      <tr
                        key={neighbor.id + index}
                        className={[
                          "rounded-md border border-zinc-800 bg-zinc-950",
                          isPredicted
                            ? "border-emerald-500/80 bg-emerald-500/10"
                            : "",
                        ].join(" ")}
                      >
                        <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-500">
                          {index + 1}
                        </td>
                        <td className="truncate px-2 py-1 text-zinc-200">
                          {neighbor.id}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[10px] text-zinc-300">
                          {formatNumber(neighbor.score)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-zinc-400">
              Try tweaking the equation coefficients, swapping tokens, or
              changing the vocabulary list to see when analogies work well and
              when they break down.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
