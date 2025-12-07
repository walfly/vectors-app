import { EmbeddingScene } from "@/components/EmbeddingScene";
import type { EmbeddingPoint } from "@/components/EmbeddingScene";

const SAMPLE_POINTS: EmbeddingPoint[] = [
  // Cluster A
  { id: "a-1", position: [-1.4, 0.4, -0.8], label: "Cluster A" },
  { id: "a-2", position: [-1.2, 0.6, -0.6], label: "Cluster A" },
  { id: "a-3", position: [-1.0, 0.2, -0.9], label: "Cluster A" },
  { id: "a-4", position: [-1.3, 0.1, -0.4], label: "Cluster A" },
  // Cluster B
  { id: "b-1", position: [0.8, -0.3, 1.1], label: "Cluster B" },
  { id: "b-2", position: [1.0, -0.1, 0.9], label: "Cluster B" },
  { id: "b-3", position: [1.2, -0.4, 1.3], label: "Cluster B" },
  { id: "b-4", position: [0.9, -0.6, 0.7], label: "Cluster B" },
  // Cluster C
  { id: "c-1", position: [0.1, 1.2, 0.2], label: "Cluster C" },
  { id: "c-2", position: [-0.1, 1.0, 0.0], label: "Cluster C" },
  { id: "c-3", position: [0.3, 1.1, -0.2], label: "Cluster C" },
  { id: "c-4", position: [0.0, 0.9, 0.4], label: "Cluster C" },
];

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Embedding Playground - 3D scatter demo
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            This page renders a small set of pre-computed 3D points using React
            Three Fiber. Use your mouse or trackpad to rotate, pan, and zoom the
            scene. Hover a point to highlight it.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm md:p-6">
          <EmbeddingScene points={SAMPLE_POINTS} />
        </section>

        <p className="text-xs text-zinc-500">
          The EmbeddingScene component accepts an array of points in 3D space
          and is ready to be wired up to PCA/UMAP-reduced embeddings produced
          by the embeddings API.
        </p>
      </div>
    </main>
  );
}
