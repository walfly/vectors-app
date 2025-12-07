const EMBEDDINGS_SERVER_URL_ENV = "EMBEDDINGS_SERVER_URL" as const;

export function getEmbeddingsServerBaseUrl(): string | null {
  const raw = process.env[EMBEDDINGS_SERVER_URL_ENV];

  if (!raw) {
    return null;
  }

  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function getEmbeddingsServerUrl(pathname: string): string | null {
  const baseUrl = getEmbeddingsServerBaseUrl();

  if (!baseUrl) {
    return null;
  }

  if (!pathname.startsWith("/")) {
    return `${baseUrl}/${pathname}`;
  }

  return `${baseUrl}${pathname}`;
}

export function getEmbeddingsServerEnvVarName(): string {
  return EMBEDDINGS_SERVER_URL_ENV;
}
