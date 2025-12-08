-- Wikipedia title embeddings schema for pgvector-backed similarity search.
--
-- This migration assumes the target Postgres database has the `pgvector`
-- extension available. It creates a table for storing embeddings of
-- Wikipedia article titles along with an IVF Flat index tuned for cosine
-- similarity search.

-- Enable the `vector` extension (no-op if already installed).
CREATE EXTENSION IF NOT EXISTS vector;

-- Core table for English Wikipedia title embeddings.
CREATE TABLE IF NOT EXISTS wikipedia_title_embeddings (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  embedding vector(384) NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en'
);

-- Approximate nearest-neighbor index optimized for cosine similarity.
--
-- The `lists` value is a reasonable default for a corpus in the
-- 10k-150k row range. You can tune it based on the expected dataset
-- size and latency/recall trade-offs.
CREATE INDEX IF NOT EXISTS wikipedia_title_embeddings_embedding_ivfflat
  ON wikipedia_title_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
