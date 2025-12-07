import { Buffer } from "node:buffer";
import http from "node:http";

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

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

function sendJson(
  res: http.ServerResponse<http.IncomingMessage>,
  status: number,
  body: unknown,
  extraHeaders?: http.OutgoingHttpHeaders,
) {
  const json = JSON.stringify(body);

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (typeof value !== "undefined") {
        res.setHeader(key, value as string);
      }
    }
  }

  res.setHeader("Content-Length", Buffer.byteLength(json));
  res.end(json);
}

async function handleEmbeddings(
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method Not Allowed");
    return;
  }

  let json: unknown;

  try {
    const text = await readRequestBody(req);
    json = text.length ? JSON.parse(text) : null;
  } catch (error) {
    sendJson(res, 400, {
      error: "Invalid JSON body.",
      details: error instanceof Error ? error.message : String(error),
    } satisfies ErrorResponseBody);
    return;
  }

  const parsedInputs = parseInputs(json);

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

    if (!Array.isArray(embeddings) || embeddings.length === 0 || !embeddings[0]?.length) {
      sendJson(res, 500, {
        error: "Embeddings model returned empty output.",
      } satisfies ErrorResponseBody);
      return;
    }

    const dimensions = embeddings[0].length;

    if (!embeddings.every((row) => Array.isArray(row) && row.length === dimensions)) {
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

    sendJson(res, 200, responseBody);
  } catch (error) {
    sendJson(res, 500, {
      error: "Failed to generate embeddings.",
      details: error instanceof Error ? error.message : String(error),
    } satisfies ErrorResponseBody);
  }
}

async function handleWarm(
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end("Method Not Allowed");
    return;
  }

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

function handleHealth(
  _req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
) {
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

const port = Number(process.env.PORT ?? "4000");

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/api/embeddings") {
    void handleEmbeddings(req, res);
    return;
  }

  if (url === "/api/warm") {
    void handleWarm(req, res);
    return;
  }

  if (url === "/api/health") {
    handleHealth(req, res);
    return;
  }

  res.statusCode = 404;
  res.end("Not Found");
});

server.listen(port, () => {
  console.log(
    `Embeddings server listening on http://localhost:${port} (model: ${MODEL_ID})`,
  );
});
