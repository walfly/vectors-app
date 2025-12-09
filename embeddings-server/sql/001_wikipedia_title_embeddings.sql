-- Wikipedia title embeddings schema for pgvector-backed similarity search.
--
-- This migration assumes the target Postgres database has the `pgvector`
-- extension available. It creates a table for storing embeddings of
-- Wikipedia article titles.
--
-- An IVFFlat index is recommended for approximate nearest-neighbor search
-- once the table contains a representative sample of embeddings. See the
-- "Wikipedia title embeddings (pgvector)" section of the README for an
-- example `CREATE INDEX` statement.

-- Enable the `vector` extension (no-op if already installed).
CREATE EXTENSION IF NOT EXISTS vector;

-- Core table for English Wikipedia title embeddings.
CREATE TABLE IF NOT EXISTS wikipedia_title_embeddings (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  embedding vector(384) NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en'
);
