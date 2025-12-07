import { NextResponse } from "next/server";

import {
  getEmbeddingsServerEnvVarName,
  getEmbeddingsServerUrl,
} from "../../../lib/embeddings/serverConfig";
import { buildErrorResponse } from "../../../lib/utils/responses";

export const runtime = "edge";

export async function GET() {
  const targetUrl = getEmbeddingsServerUrl("/api/warm");

  if (!targetUrl) {
    return buildErrorResponse(500, {
      error: `Embeddings server URL is not configured. Set ${getEmbeddingsServerEnvVarName()} in the environment.`,
    });
  }

  let upstream: Response;

  try {
    upstream = await fetch(targetUrl, { method: "GET" });
  } catch (error) {
    return buildErrorResponse(502, {
      error: "Failed to reach embeddings server.",
      details: error instanceof Error ? error.message : undefined,
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "";

  let json: unknown;

  if (contentType.includes("application/json")) {
    try {
      json = await upstream.json();
    } catch (error) {
      return buildErrorResponse(502, {
        error: "Embeddings server returned invalid JSON.",
        details: error instanceof Error ? error.message : undefined,
      });
    }
  } else {
    const text = await upstream.text();

    return buildErrorResponse(502, {
      error: "Embeddings server returned a non-JSON response.",
      details: text.slice(0, 256),
    });
  }

  return NextResponse.json(json, { status: upstream.status });
}
