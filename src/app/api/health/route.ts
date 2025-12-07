import { NextResponse } from "next/server";

import { getEmbeddingsModelStatus, MODEL_ID } from "../../../lib/embeddings/pipeline";

export const runtime = "nodejs";

type HealthStatus = "ok" | "degraded" | "error";

type HealthResponseBody = {
  status: HealthStatus;
  modelLoaded: boolean;
  modelName: string;
  kvAvailable: boolean;
};

function getKvAvailable(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL ||
      process.env.VERCEL_KV_REST_API_URL ||
      process.env.KV_URL,
  );
}

export async function GET() {
  const { modelLoaded, error } = getEmbeddingsModelStatus();

  let status: HealthStatus;

  if (error) {
    status = "error";
  } else if (modelLoaded) {
    status = "ok";
  } else {
    status = "degraded";
  }

  const body: HealthResponseBody = {
    status,
    modelLoaded,
    modelName: MODEL_ID,
    kvAvailable: getKvAvailable(),
  };

  return NextResponse.json(body, { status: 200 });
}
