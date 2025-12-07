import { EmbeddingPlayground } from "@/components/EmbeddingPlayground";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Embedding Playground
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            Type a few words or short phrases, generate embeddings for them
            using the server-side model, reduce them to 3D, and see the results
            plotted in an interactive scene. Use your mouse or trackpad to
            rotate, pan, and zoom the visualization.
          </p>
        </header>

        <EmbeddingPlayground />
      </div>
    </main>
  );
}
