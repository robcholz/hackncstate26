export interface GetRendererImageInput {
  url: string;
  timeout: number;
}

export interface RendererClient {
  getImage: (input: GetRendererImageInput) => Promise<string>;
}

interface RendererSuccessResponse {
  status: "success";
  data: {
    image: string;
  };
}

export class RendererConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererConfigError";
  }
}

export class RendererRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "RendererRequestError";
    this.status = status;
  }
}

export class RendererTooManyRequestsError extends RendererRequestError {
  constructor(message = "Renderer is overloaded") {
    super(message, 429);
    this.name = "RendererTooManyRequestsError";
  }
}

export class RendererTimeoutError extends RendererRequestError {
  constructor(message = "Renderer request timed out") {
    super(message);
    this.name = "RendererTimeoutError";
  }
}

// The renderer microservice runs separately from the Next app.
// Default to the local dev port used by `renderer-server/main.py`.
const DEFAULT_RENDERER_BASE_URL = "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 3_000;

function parseImageFromResponse(payload: unknown): string {
  const candidate = payload as RendererSuccessResponse;
  const image = candidate?.data?.image;
  if (typeof image !== "string" || image.length === 0) {
    throw new RendererRequestError("Renderer returned an invalid image payload");
  }

  return image;
}

export function createRendererClient(config?: { baseUrl?: string; token?: string }): RendererClient {
  const baseUrl = config?.baseUrl?.trim() || process.env.WEBSITE_RENDERER_BASE_URL?.trim() || DEFAULT_RENDERER_BASE_URL;
  const token = config?.token?.trim() || process.env.WEBSITE_RENDERER_TOKEN?.trim();

  if (!token) {
    throw new RendererConfigError("WEBSITE_RENDERER_TOKEN must be configured");
  }

  const getImage: RendererClient["getImage"] = async ({ url, timeout }) => {
    const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;

    try {
      const response = await fetch(`${baseUrl}/api/v1/render`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ url, timeout: timeoutMs }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (response.status === 429) {
        throw new RendererTooManyRequestsError();
      }

      if (!response.ok) {
        throw new RendererRequestError("Renderer request failed", response.status);
      }

      const payload = (await response.json()) as unknown;
      return parseImageFromResponse(payload);
    } catch (error) {
      if (error instanceof RendererTooManyRequestsError) {
        throw error;
      }

      if (error instanceof RendererRequestError) {
        throw error;
      }

      const isTimeoutError =
        error instanceof DOMException
          ? error.name === "TimeoutError" || error.name === "AbortError"
          : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

      if (isTimeoutError) {
        throw new RendererTimeoutError();
      }

      throw new RendererRequestError("Renderer request failed");
    }
  };

  return { getImage };
}

declare global {
  var __rendererClient__: RendererClient | undefined;
}

export function getOrCreateRendererClient(): RendererClient {
  if (!globalThis.__rendererClient__) {
    globalThis.__rendererClient__ = createRendererClient();
  }

  return globalThis.__rendererClient__;
}
