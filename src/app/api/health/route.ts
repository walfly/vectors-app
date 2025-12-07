import { NextResponse } from "next/server";

import {
  getEmbeddingsServerEnvVarName,
  getEmbeddingsServerUrl,
} from "../../../lib/embeddings/serverConfig";

export const runtime = "edge";

type HealthStatus = "ok" | "degraded" | "error";

type EmbeddingsHealthResponseBody = {
  status: HealthStatus;
  modelLoaded: boolean;
  initializing: boolean;
  modelName: string;
};

type HealthResponseBody = EmbeddingsHealthResponseBody & {
  kvAvailable: boolean;
};

function getKvAvailable(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL ||
      process.env.VERCEL_KV_REST_API_URL ||
      process.env.KV_URL,
  );
}

function buildFallbackEmbeddingsHealth(): EmbeddingsHealthResponseBody {
  return {
    status: "error",
    modelLoaded: false,
    initializing: false,
    modelName: `unknown (set ${getEmbeddingsServerEnvVarName()} for details)`,
  };
}

export async function GET() {
  const targetUrl = getEmbeddingsServerUrl("/api/health");

  let embeddingsHealth: EmbeddingsHealthResponseBody;

  if (!targetUrl) {
    embeddingsHealth = buildFallbackEmbeddingsHealth();
  } else {
    try {
      const upstream = await fetch(targetUrl, { method: "GET" });
      const contentType = upstream.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        embeddingsHealth = (await upstream.json()) as EmbeddingsHealthResponseBody;
      } else {
        embeddingsHealth = buildFallbackEmbeddingsHealth();
      }
    } catch {
      embeddingsHealth = buildFallbackEmbeddingsHealth();
    }
  }

  const body: HealthResponseBody = {
    ...embeddingsHealth,
    kvAvailable: getKvAvailable(),
  };

  return NextResponse.json(body, { status: 200 });
}
