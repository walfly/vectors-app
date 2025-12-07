import { createHash } from "node:crypto";

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createClient } from "redis";

import {
  MODEL_ID,
  ensureEmbeddingsPipelineInitializing,
  getEmbeddingsModelStatus,
  getEmbeddingsPipeline,
  getEmbeddingsPipelineError,
  getEmbeddingsPipelineInitPromise,
  isEmbeddingsPipelineReady,
} from "./lib/embeddings/pipeline";

const MAX_INPUTS = 64;
const MAX_INPUT_LENGTH = 1024; // characters
const REDIS_URL_ENV = "REDIS_URL" as const;
const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

type EmbeddingsResponseBody = {
  model: string;
  embeddings: number[][];
  dimensions: number;
};

type ErrorResponseBody = {
  error: string;
  details?: string;
  status?: "initializing";
  model?: string;
};

type WarmResponseBody = {
  warmed: boolean;
  modelName: string;
  status: "initializing" | "ready" | "error";
  error?: string;
};

type HealthStatus = "ok" | "degraded" | "error";

type HealthResponseBody = {
  status: HealthStatus;
  modelLoaded: boolean;
  initializing: boolean;
  modelName: string;
};

type EmbeddingsCacheEntry = EmbeddingsResponseBody;

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisInitPromise: Promise<RedisClient | null> | null = null;

function getRedisUrl(): string | null {
  const raw = process.env[REDIS_URL_ENV];

  if (!raw) {
    return null;
  }

  return raw;
}

function getEmbeddingsCacheTtlSeconds(): number | null {
  const raw = process.env.EMBEDDINGS_CACHE_TTL_SECONDS;

  if (!raw) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function getRedisClient(): Promise<RedisClient | null> {
  const url = getRedisUrl();

  if (!url) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  if (!redisInitPromise) {
    redisInitPromise = (async () => {
      const client = createClient({ url });

      client.on("error", (error) => {
        console.error("Redis client error", error);
      });

      await client.connect();

      redisClient = client;
      return client;
    })().catch((error) => {
      console.error("Failed to initialize Redis client", error);
      redisInitPromise = null;
      return null;
    });
  }

  return redisInitPromise;
}

function buildEmbeddingsCacheKey(inputs: string[]): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ model: MODEL_ID, inputs }));
  return `embeddings:${MODEL_ID}:${hash.digest("hex")}`;
}

async function getCachedEmbeddings(
  inputs: string[],
): Promise<EmbeddingsCacheEntry | null> {
  const client = await getRedisClient();

  if (!client) {
    return null;
  }

  const key = buildEmbeddingsCacheKey(inputs);

  try {
    const value = await client.get(key);

    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as EmbeddingsCacheEntry;

    if (
      !parsed ||
      parsed.model !== MODEL_ID ||
      !Array.isArray(parsed.embeddings) ||
      parsed.embeddings.length === 0 ||
      typeof parsed.dimensions !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to read embeddings from Redis cache", error);
    return null;
  }
}

async function setCachedEmbeddings(
  inputs: string[],
  body: EmbeddingsCacheEntry,
): Promise<void> {
  const client = await getRedisClient();

  if (!client) {
    return;
  }

  const ttlSeconds = getEmbeddingsCacheTtlSeconds();
  const key = buildEmbeddingsCacheKey(inputs);

  try {
    const payload = JSON.stringify(body);

    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, payload, { EX: ttlSeconds });
    } else {
      await client.set(key, payload);
    }
  } catch (error) {
    console.error("Failed to write embeddings to Redis cache", error);
  }
}

function parseInputs(body: unknown): string[] | ErrorResponseBody {
  if (body === null || typeof body !== "object") {
    return {
      error:
        "Invalid request body: expected a JSON object with an 'inputs' array.",
    };
  }

  const { inputs } = body as { inputs?: unknown };

  if (!Array.isArray(inputs)) {
    return {
      error: "Invalid request body: 'inputs' must be an array of strings.",
    };
  }

  const normalized = inputs.map((item) =>
    typeof item === "string" ? item.trim() : item,
  );

  if (!normalized.length) {
    return {
      error: "Invalid request body: 'inputs' array must not be empty.",
    };
  }

  if (normalized.some((item) => typeof item !== "string")) {
    return {
      error: "Invalid request body: all 'inputs' entries must be strings.",
    };
  }

  const nonEmptyInputs = normalized.filter((item) => item.length > 0) as string[];

  if (!nonEmptyInputs.length) {
    return {
      error:
        "Invalid request body: at least one input string must be non-empty.",
    };
  }

  if (nonEmptyInputs.length > MAX_INPUTS) {
    return {
      error: `Invalid request body: 'inputs' must not contain more than ${MAX_INPUTS} items.`,
    };
  }

  if (nonEmptyInputs.some((item) => item.length > MAX_INPUT_LENGTH)) {
    return {
      error: `Invalid request body: each input string must be at most ${MAX_INPUT_LENGTH} characters long.`,
    };
  }

  return nonEmptyInputs;
}

function sendJson(
  res: Response,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (typeof value !== "undefined") {
        res.setHeader(key, value);
      }
    }
  }

  res.json(body);
}

async function handleEmbeddings(req: Request, res: Response) {
  const parsedInputs = parseInputs(req.body);

  if (!Array.isArray(parsedInputs)) {
    sendJson(res, 400, parsedInputs);
    return;
  }

  ensureEmbeddingsPipelineInitializing();

  const initError = getEmbeddingsPipelineError();

  if (initError) {
    sendJson(res, 500, {
      error: "Failed to initialize embeddings model.",
      details: initError.message,
    } satisfies ErrorResponseBody);
    return;
  }

  if (!isEmbeddingsPipelineReady()) {
    sendJson(
      res,
      503,
      {
        error: "Embeddings model is still loading. Please try again shortly.",
        status: "initializing",
        model: MODEL_ID,
      } satisfies ErrorResponseBody,
      {
        "Retry-After": "5",
      },
    );
    return;
  }

  const cached = await getCachedEmbeddings(parsedInputs);

  if (cached) {
    sendJson(res, 200, cached);
    return;
  }

  try {
    const readyEmbeddingsPipeline = getEmbeddingsPipeline();

    if (!readyEmbeddingsPipeline) {
      throw new Error("Embeddings pipeline missing despite ready status");
    }

    const rawOutput = (await readyEmbeddingsPipeline(parsedInputs, {
      pooling: "mean",
      normalize: true,
    })) as {
      dims?: number[];
      data?: {
        length: number;
        [index: number]: number;
      };
      tolist?: () => number[][] | number[];
    };

    let embeddings: number[][];

    if (typeof rawOutput.tolist === "function") {
      const list = rawOutput.tolist();

      if (!Array.isArray(list) || list.length === 0) {
        sendJson(res, 500, {
          error: "Embeddings model returned empty or invalid list output.",
        } satisfies ErrorResponseBody);
        return;
      }

      embeddings = Array.isArray(list[0])
        ? (list as number[][])
        : [list as number[]];
    } else if (
      rawOutput.data &&
      Array.isArray(rawOutput.dims) &&
      rawOutput.dims.length === 2
    ) {
      const [batchSize, dimension] = rawOutput.dims;
      const expectedLength = batchSize * dimension;

      if (rawOutput.data.length !== expectedLength) {
        sendJson(res, 500, {
          error: "Embeddings model returned data with unexpected length.",
          details: `expected ${expectedLength}, got ${rawOutput.data.length}`,
        } satisfies ErrorResponseBody);
        return;
      }

      const flat = Array.from(rawOutput.data);
      embeddings = [];
      for (let index = 0; index < batchSize; index += 1) {
        const start = index * dimension;
        const end = start + dimension;
        embeddings.push(flat.slice(start, end));
      }
    } else {
      sendJson(res, 500, {
        error: "Unexpected embeddings output format from model.",
      } satisfies ErrorResponseBody);
      return;
    }

    if (
      !Array.isArray(embeddings) ||
      embeddings.length === 0 ||
      !embeddings[0]?.length
    ) {
      sendJson(res, 500, {
        error: "Embeddings model returned empty output.",
      } satisfies ErrorResponseBody);
      return;
    }

    const dimensions = embeddings[0].length;

    if (
      !embeddings.every(
        (row) => Array.isArray(row) && row.length === dimensions,
      )
    ) {
      sendJson(res, 500, {
        error: "Embeddings model returned rows with inconsistent dimensions.",
      } satisfies ErrorResponseBody);
      return;
    }

    const responseBody: EmbeddingsResponseBody = {
      model: MODEL_ID,
      embeddings,
      dimensions,
    };

    await setCachedEmbeddings(parsedInputs, responseBody);

    sendJson(res, 200, responseBody);
  } catch (error) {
    sendJson(res, 500, {
      error: "Failed to generate embeddings.",
      details: error instanceof Error ? error.message : String(error),
    } satisfies ErrorResponseBody);
  }
}

async function handleWarm(_req: Request, res: Response) {
  ensureEmbeddingsPipelineInitializing();

  const existingError = getEmbeddingsPipelineError();

  if (existingError) {
    const body: WarmResponseBody = {
      warmed: false,
      modelName: MODEL_ID,
      status: "error",
      error: existingError.message,
    };

    sendJson(res, 500, body);
    return;
  }

  const initPromise = getEmbeddingsPipelineInitPromise();

  if (!isEmbeddingsPipelineReady() && initPromise) {
    try {
      await initPromise;
    } catch (error) {
      console.error("Embeddings warm-up initialization rejected", error);

      const recordedError = getEmbeddingsPipelineError();

      const body: WarmResponseBody = {
        warmed: false,
        modelName: MODEL_ID,
        status: "error",
        error:
          recordedError?.message ??
          "Embeddings initialization failed; see server logs for details.",
      };

      sendJson(res, 500, body);
      return;
    }
  }

  const error = getEmbeddingsPipelineError();
  const warmed = isEmbeddingsPipelineReady();

  if (error) {
    const body: WarmResponseBody = {
      warmed: false,
      modelName: MODEL_ID,
      status: "error",
      error: error.message,
    };

    sendJson(res, 500, body);
    return;
  }

  const body: WarmResponseBody = {
    warmed,
    modelName: MODEL_ID,
    status: warmed ? "ready" : "initializing",
  };

  sendJson(res, 200, body);
}

function handleHealth(_req: Request, res: Response) {
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
  };

  sendJson(res, 200, body);
}

const app = express();

app.use(
  express.json({
    limit: "256kb",
  }),
);

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (error instanceof SyntaxError) {
      sendJson(res, 400, {
        error: "Invalid JSON body.",
        details: (error as Error).message,
      } satisfies ErrorResponseBody);
      return;
    }

    next(error);
  },
);

app.post("/api/embeddings", (req, res) => {
  void handleEmbeddings(req, res);
});

app.all("/api/embeddings", (req, res) => {
  res.setHeader("Allow", "POST");
  res.status(405).send("Method Not Allowed");
});

app.get("/api/warm", (req, res) => {
  void handleWarm(req, res);
});

app.all("/api/warm", (_req, res) => {
  res.setHeader("Allow", "GET");
  res.status(405).send("Method Not Allowed");
});

app.get("/api/health", (req, res) => {
  handleHealth(req, res);
});

app.all("/api/health", (_req, res) => {
  res.setHeader("Allow", "GET");
  res.status(405).send("Method Not Allowed");
});

app.use((req, res) => {
  res.status(404).send("Not Found");
});

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    console.error("Unhandled error in embeddings server", error);

    sendJson(res, 500, {
      error: "Internal server error.",
      details: error instanceof Error ? error.message : String(error),
    } satisfies ErrorResponseBody);
  },
);

const port = Number(process.env.PORT ?? "4000");

app.listen(port, () => {
  console.log(
    `Embeddings server listening on http://localhost:${port} (model: ${MODEL_ID})`,
  );
});
