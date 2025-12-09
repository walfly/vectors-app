import { runPendingMigrations } from "./lib/migrations";

async function main(): Promise<void> {
  try {
    await runPendingMigrations();
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));

    console.error(
      "Failed to run embeddings-server database migrations. Aborting startup.",
      normalizedError,
    );

    process.exitCode = 1;
    return;
  }

  // Start the HTTP server only after migrations have been applied. The
  // server exports no symbols; importing the module is enough to bind the
  // Express app to the configured PORT.
  await import("./server");
}

void main();
