import { NextResponse } from "next/server";

import { getKvAvailable } from "@/lib/embeddings/cache";
import { getEmbeddingsModelStatus, MODEL_ID } from "../../../lib/embeddings/pipeline";

export const runtime = "nodejs";

type HealthStatus = "ok" | "degraded" | "error";

type HealthResponseBody = {
  status: HealthStatus;
  modelLoaded: boolean;
  initializing: boolean;
  modelName: string;
  kvAvailable: boolean;
};

export async function GET() {
  const { modelLoaded, initializing, error } = getEmbeddingsModelStatus();

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
    initializing,
    modelName: MODEL_ID,
    kvAvailable: getKvAvailable(),
  };

  return NextResponse.json(body, { status: 200 });
}
