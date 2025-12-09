# VectorVerse: Embedding Playground

Interactive playground for building intuition about vector embeddings and
high-dimensional geometry. The UI is a Next.js app, backed by a separate
TypeScript embeddings server that hosts the Hugging Face model.

For product context and long-form design details, see [`prd.md`](./prd.md).

---

## Architecture overview

This repo contains **two TypeScript services**:

- **Next.js app (Vercel)** – User-facing UI and lightweight API routes under
  `src/app/api`. These routes handle vector math, dimensionality reduction, and
  proxy HTTP requests to the embeddings server.
- **Embeddings server (Render or similar)** – Standalone Node/Express service
  in `embeddings-server/` that loads the embeddings model via
  `@huggingface/transformers`, runs inference, and optionally caches results in
  Redis.

The Next app talks to the embeddings server over HTTP using the
`EMBEDDINGS_SERVER_URL` environment variable. All heavy ML dependencies live in
the embeddings server, keeping the Vercel deployment lean.

---

## Requirements

- **Node.js**: >= 20.9.0 (matches the `next@16.0.7` engine requirement)
- **pnpm**: >= 10 (repo is developed with `pnpm@10.24.0`)

Using older Node or pnpm versions may cause install or runtime issues,
especially for the embeddings server dependencies.

---

## Local development

This project uses **pnpm** as the package manager for both services.

### 1. Install dependencies

Clone the repo, then install deps for the Next app:

```bash
pnpm install
```

Install deps for the embeddings server:

```bash
cd embeddings-server
pnpm install
```

### 2. Start the embeddings server

From `embeddings-server/`:

```bash
cd embeddings-server
pnpm build
pnpm start
```

By default the server listens on `http://localhost:4000` and exposes:

- `POST /api/embeddings` – generate embeddings for an array of input strings
- `GET  /api/warm` – trigger model warm-up and report status
- `GET  /api/health` – embeddings model health summary

The first run will download the model and may take a little while to warm up.

If you want to run the embeddings server together with Redis **and** a
Postgres instance (with the `pgvector` extension enabled) locally, you can
also use Docker:

```bash
cd embeddings-server
docker compose up
```

This will start:

- The embeddings server on `http://localhost:4000`
- Redis on `localhost:6379`
- Postgres (with `pgvector`) on `localhost:5432`, with a default `embeddings`
  database and credentials `postgres` / `postgres`

> **Note:** These Postgres credentials are intended for local development
> only. For any shared, staging, or production environment, configure a
> separate Postgres instance with strong, unique credentials and do **not**
> reuse `postgres` / `postgres`.

### 3. Configure the Next app to talk to the embeddings server

In the repo root, create `.env.local` with at least:

```bash
EMBEDDINGS_SERVER_URL=http://localhost:4000
```

This URL must point at a running instance of the embeddings server (local or
remote). In production, this will typically be the Render service URL.

### 4. Run the Next dev server

From the repo root:

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000) to use the
Embedding Playground.

---

## Project structure

High-level layout:

```text
.
├── embeddings-server/            # Standalone Node/Express embeddings service
│   ├── src/
│   │   ├── lib/embeddings/       # Model lifecycle + status helpers
│   │   └── server.ts             # HTTP API (embeddings, warm, health)
│   └── tsconfig.json
├── src/                          # Next.js app (App Router)
│   ├── app/
│   │   ├── api/
│   │   │   ├── embeddings/       # Proxies to embeddings server
│   │   │   ├── reduce/           # Dimensionality reduction (PCA/UMAP)
│   │   │   ├── similarity/       # Pairwise similarity/distance matrix
│   │   │   ├── nearest/          # Nearest-neighbor search
│   │   │   ├── arithmetic/       # Vector arithmetic + nearest neighbors
│   │   │   ├── health/           # Combined app + embeddings health
│   │   │   └── warm/             # Proxy warm-up endpoint
│   │   ├── layout.tsx
│   │   └── page.tsx              # Embedding Playground UI
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   │   ├── embeddings/           # Client utilities for calling API routes
│   │   ├── vectors/              # Vector math + reduction helpers
│   │   └── utils/                # Shared helpers (e.g., error responses)
│   └── types/
├── prd.md                        # Detailed product requirements & design
└── vercel.json                   # Vercel build configuration
```

Path aliases are configured so imports like `@/components/...`, `@/lib/...`,
and `@/types/...` resolve to the corresponding folders under `src/`.

---

## Environment variables

### Next.js app

Set these in Vercel (or `.env.local` for local dev):

- **Minimal config:** `EMBEDDINGS_SERVER_URL` must be set for the app to call
  the embeddings server.

- `EMBEDDINGS_SERVER_URL` **(required)** – Base URL of the embeddings server
  (trailing slash is fine; it will be trimmed), for example:
  - `http://localhost:4000`
  - `https://your-embeddings-service.onrender.com`
- `KV_REST_API_URL`, `VERCEL_KV_REST_API_URL`, or `KV_URL` *(optional)* – If
  configured, `/api/health` will report `kvAvailable: true`.

### Embeddings server

Set these wherever the embeddings server runs (Render, local Docker, etc.):

- **Minimal config:** `PORT` may be provided by the platform; otherwise the
  server defaults to `4000`. Redis and Postgres-related variables are optional
  but recommended for caching and pgvector-backed storage.

- `PORT` *(optional, default `4000`)* – HTTP port for the embeddings server.
- `REDIS_URL` *(optional but recommended)* – Redis connection string used for
  caching embeddings. If omitted, the server still works but disables cache
  reads/writes.
- `EMBEDDINGS_CACHE_TTL_SECONDS` *(optional)* – TTL for cached embeddings in
  seconds. When unset, entries default to a 24-hour TTL. If set to a
  non-positive or non-numeric value, no TTL is applied and entries persist
  until evicted by Redis.
- `PGVECTOR_DATABASE_URL` *(optional, but required for pgvector-backed
  features)* – Postgres connection string for the database that has the
  `pgvector`/`vector` extension enabled. For example:
  - Local Docker Compose: `postgres://postgres:postgres@localhost:5432/embeddings`
  - Render Postgres (internal URL): use the `connectionString` value wired via
    `fromDatabase` in `embeddings-server/render.yaml`.

  When this variable is set, the embeddings server's pgvector client module
  will lazily create a connection pool and surface clear errors in logs if the
  database is unreachable or the URL is misconfigured.

  The client currently relies on the default connection pool settings from the
  `pg` driver. On small or free-tier Postgres plans with low connection limits,
  you may want to tune pool-related environment variables (see the `pg`
  documentation) to avoid exhausting available connections under higher
  concurrency.

---

## API overview

All external callers should use the Next.js routes; the embeddings server is an
internal dependency.

**Next.js API routes (`/api/*`):**

- `POST /api/embeddings` – Proxy to embeddings server; accepts a JSON body with
  an `inputs` array of strings.
- `POST /api/reduce` – Reduce high-dimensional vectors to 2D/3D via PCA or
  UMAP.
- `POST /api/similarity` – Compute pairwise similarity/distance matrix between
  vectors.
- `POST /api/nearest` – Brute-force nearest-neighbor search over labeled
  candidate vectors.
- `POST /api/arithmetic` – Perform weighted vector arithmetic and (optionally)
  return nearest neighbors to the result.
- `GET  /api/health` – Combined health check (embeddings model + KV
  availability).
- `GET  /api/warm` – Proxy warm-up endpoint that triggers embeddings model
  initialization.

**Embeddings server API (`${EMBEDDINGS_SERVER_URL}/api/*`):**

- `POST /api/embeddings` – Run the embeddings model and return normalized
  vectors plus metadata.
- `GET  /api/warm` – Ensure the model is initialized and report status.
- `GET  /api/health` – Report embeddings model health only (no KV checks).

---

## Scripts

From the repo root (Next.js app):

```bash
pnpm dev     # Start Next.js dev server on http://localhost:3000
pnpm build   # Production build
pnpm start   # Start production server (after pnpm build)
pnpm lint    # Run ESLint
pnpm test    # Run Vitest tests for the Next app
```

From `embeddings-server/`:

```bash
pnpm build   # Compile TypeScript to dist/
pnpm start   # Start the embeddings server
pnpm test    # Run Vitest tests for the embeddings pipeline
```

### Wikipedia title embeddings (pgvector)

The embeddings server can store English Wikipedia article title embeddings in
Postgres using the `pgvector` extension.

Schema migrations for this table live under `embeddings-server/sql/` and are
automatically applied on embeddings-server startup whenever
`PGVECTOR_DATABASE_URL` is configured. This automatic runner is the
recommended way to create and update the schema in most environments.

A small migration helper in `embeddings-server/src/lib/migrations.ts` tracks
applied files in a `embeddings_server_schema_migrations` table and runs any new
`*.sql` files in lexicographic order before the HTTP server begins listening.

On a fresh database (for example, the local Docker Compose Postgres
instance), the first time you start the embeddings server with
`PGVECTOR_DATABASE_URL` set, it will automatically apply
`sql/001_wikipedia_title_embeddings.sql`.

If you need to inspect or debug a migration manually, you can also apply it
via `psql`. The initial migration is written with `IF NOT EXISTS` guards on
both the extension and table, so it is safe to re-run on the same database:

```bash
cd embeddings-server

# Example only – adjust to your environment and avoid using real
# production credentials in shell history.
export PGVECTOR_DATABASE_URL="postgres://postgres:postgres@localhost:5432/embeddings"

psql "$PGVECTOR_DATABASE_URL" \
  -f sql/001_wikipedia_title_embeddings.sql
```

The initial migration will:

- Ensure the `vector` extension is installed.
- Create a `wikipedia_title_embeddings` table with a `vector(384)` column.

The `vector(384)` definition matches the output dimensionality of the
`Xenova/all-MiniLM-L6-v2` model used by the embeddings server. If you switch
to a different model with a new embedding dimension, you will need to update
this migration (and any backfill scripts) accordingly.

Once the table contains a representative number of rows (for example, after
running the backfill script below), you can add an `ivfflat` index on the
`embedding` column to speed up approximate nearest-neighbor queries. `pgvector`
recommends creating IVFFlat indexes after the table has data so k-means
clustering can use real embeddings.

For example:

```sql
CREATE INDEX IF NOT EXISTS wikipedia_title_embeddings_embedding_ivfflat
  ON wikipedia_title_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

Once the schema is in place, you can **manually** backfill embeddings for a
corpus of English Wikipedia titles using the existing embeddings pipeline.
This is an optional, operational step and should not be wired into normal
local dev, CI, or server startup flows.

```bash
cd embeddings-server

# Example: run a one-off manual backfill against a local Postgres instance.
# This may take several minutes and consume CPU/DB resources depending on
# the target count and hardware. Only run this when you are deliberately
# populating the `wikipedia_title_embeddings` table.
PGVECTOR_DATABASE_URL="postgres://postgres:postgres@localhost:5432/embeddings" \
WIKIPEDIA_TITLES_TARGET_COUNT=20000 \
pnpm run backfill:wikipedia-titles:build
```

If you have already built the embeddings server (for example, in CI or inside
an image), you can skip the extra build step and invoke the compiled script
directly:

```bash
cd embeddings-server

PGVECTOR_DATABASE_URL="..." \
WIKIPEDIA_TITLES_TARGET_COUNT=20000 \
pnpm run backfill:wikipedia-titles
```

The backfill script:

- Fetches a configurable number of English Wikipedia titles (defaults to
  about 20k, clamped between 10k and 50k) from the public MediaWiki API.
- Batches titles through the existing `Xenova/all-MiniLM-L6-v2` embeddings
  pipeline with mean pooling and L2 normalization.
- Upserts rows into the `wikipedia_title_embeddings` table using
  parameterized SQL and `INSERT ... ON CONFLICT (title) DO UPDATE` so it can
  be rerun safely.

In production, point `PGVECTOR_DATABASE_URL` at your managed Postgres
instance. The backfill script is a manual, one-off CLI entrypoint and is
never invoked automatically by the embeddings server.

---

## Deployment

- **Next.js app** – Deploy to Vercel using the default Next.js settings. Set
  `EMBEDDINGS_SERVER_URL` in the Vercel project environment to point at the
  embeddings server.
- **Embeddings server** – Deploy to Render or any Node host that supports
  long-lived services. Provide `REDIS_URL` for caching and configure `PORT` as
  required by the platform.

Once deployed, the Next app will proxy all embedding requests through the
configured embeddings server, keeping the UI responsive while heavy model
inference happens off the Vercel edge runtime.

### Production deployment checklist

1. **Deploy the embeddings server** to Render (or similar) and confirm
   `GET ${EMBEDDINGS_SERVER_URL}/api/health` reports a healthy status.
2. **Configure Vercel environment:** set `EMBEDDINGS_SERVER_URL` to the
   embeddings server URL (including protocol, e.g., `https://...`).
3. **Deploy the Next.js app** to Vercel.
4. **Verify health:** call the Next app's `GET /api/health` endpoint and check
   that both the embeddings model status and `kvAvailable` (if configured) look
   correct before directing users to the UI.
