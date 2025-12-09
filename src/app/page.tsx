import { EmbeddingPlayground } from "@/components/embedding-playground/EmbeddingPlayground";
import { IdeasSlider } from "@/components/ideas-slider/IdeasSlider";
import { VectorArithmeticLab } from "@/components/vector-arithmetic-lab/VectorArithmeticLab";

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

        <section className="border-t border-zinc-900 pt-6">
          <div className="mb-4 max-w-2xl space-y-1 text-sm text-zinc-400">
            <h2 className="text-base font-semibold text-zinc-100">
              Vector Arithmetic Laboratory
            </h2>
            <p>
              Explore the classic word algebra examples built on top of the
              same embeddings used in the playground. Build equations, make a
              prediction, and then see which words land closest to the result
              in embedding space.
            </p>
          </div>

          <VectorArithmeticLab />
        </section>

        <section className="border-t border-zinc-900 pt-6">
          <div className="mb-4 max-w-2xl space-y-1 text-sm text-zinc-400">
            <h2 className="text-base font-semibold text-zinc-100">
              Ideas slider
            </h2>
            <p>
              Blend between two natural-language ideas in embedding space and
              see which Wikipedia titles are closest to each point along the
              slider.
            </p>
          </div>

          <IdeasSlider />
        </section>
      </div>
    </main>
  );
}
