import fs from "node:fs/promises";
import path from "node:path";

import { getPgvectorDatabaseUrl, runPgvectorQuery } from "./pgvector";

const MIGRATIONS_TABLE = "embeddings_server_schema_migrations" as const;

type Migration = {
  id: string;
  filename: string;
  fullPath: string;
};

function getMigrationsDirectory(): string {
  // When compiled, this module lives in dist/lib/, so ../../sql resolves
  // back to the runtime sql/ directory in the container/image.
  return path.resolve(__dirname, "..", "..", "sql");
}

async function listSqlMigrations(): Promise<Migration[]> {
  const migrationsDir = getMigrationsDirectory();

  let entries;

  try {
    entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));

    // If the directory does not exist, treat it as "no migrations" so
    // environments without pgvector/sql wiring can still start.
    if ((normalizedError as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw normalizedError;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return files.map((filename) => ({
    id: filename,
    filename,
    fullPath: path.join(migrationsDir, filename),
  }));
}

async function ensureMigrationsTable(): Promise<void> {
  await runPgvectorQuery(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);`,
  );
}

async function getAppliedMigrationIds(): Promise<Set<string>> {
  await ensureMigrationsTable();

  const result = await runPgvectorQuery<{ id: string }>(
    `SELECT id FROM ${MIGRATIONS_TABLE}`,
  );

  const applied = new Set<string>();

  for (const row of result.rows) {
    if (row.id) {
      applied.add(row.id);
    }
  }

  return applied;
}

export async function runPendingMigrations(): Promise<void> {
  const databaseUrl = getPgvectorDatabaseUrl();

  if (!databaseUrl) {
    console.warn(
      "PGVECTOR_DATABASE_URL is not set; skipping embeddings-server SQL migrations.",
    );
    return;
  }

  const migrations = await listSqlMigrations();

  if (migrations.length === 0) {
    console.log("No SQL migrations found under embeddings-server/sql; skipping.");
    return;
  }

  const applied = await getAppliedMigrationIds();
  const pending = migrations.filter((migration) => !applied.has(migration.id));

  if (!pending.length) {
    console.log("No pending embeddings-server database migrations to apply.");
    return;
  }

  console.log(
    `Applying ${pending.length} pending embeddings-server migration(s): ${pending
      .map((migration) => migration.filename)
      .join(", ")}`,
  );

  for (const migration of pending) {
    const sql = await fs.readFile(migration.fullPath, "utf8");

    console.log(`Applying migration ${migration.filename}...`);

    try {
      await runPgvectorQuery(sql);

      try {
        await runPgvectorQuery(
          `INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1)`,
          [migration.id] as const,
        );
      } catch (insertError) {
        const normalizedInsertError =
          insertError instanceof Error
            ? insertError
            : new Error(String(insertError));

        // If another process applied the same migration concurrently, we may
        // see a unique-violation here. Log and continue so multiple instances
        // can start safely against the same database.
        if (
          (normalizedInsertError as { code?: string }).code === "23505"
        ) {
          console.warn(
            `Migration ${migration.filename} was already recorded as applied; continuing.`,
          );
        } else {
          throw normalizedInsertError;
        }
      }

      console.log(`Migration ${migration.filename} applied successfully.`);
    } catch (error) {
      console.error(
        `Failed to apply embeddings-server migration ${migration.filename}.`,
        error,
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
