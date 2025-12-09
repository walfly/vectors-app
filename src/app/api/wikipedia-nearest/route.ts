import { NextRequest, NextResponse } from "next/server";

import {
  getEmbeddingsServerEnvVarName,
  getEmbeddingsServerUrl,
} from "../../../lib/embeddings/serverConfig";
import { buildErrorResponse } from "../../../lib/utils/responses";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const targetUrl = getEmbeddingsServerUrl("/api/wikipedia-nearest");

  if (!targetUrl) {
    return buildErrorResponse(500, {
      error: `Embeddings server URL is not configured. Set ${getEmbeddingsServerEnvVarName()} in the environment.`,
    });
  }

  let upstream: Response;

  try {
    const bodyText = await request.text();

    upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: bodyText,
    });
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

  const retryAfter = upstream.headers.get("retry-after");
  const init: ResponseInit = {
    status: upstream.status,
  };

  if (retryAfter) {
    init.headers = {
      "Retry-After": retryAfter,
    };
  }

  return NextResponse.json(json, init);
}
