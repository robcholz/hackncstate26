import { NextResponse } from "next/server";

import {
  RendererConfigError,
  RendererRequestError,
  RendererTimeoutError,
  RendererTooManyRequestsError
} from "../../../../server/clients/renderer/renderer-client";
import { mapSusIndexToApi } from "../../../../server/mappers/sus-index.mapper";
import { getBackendRenderResult } from "../../../../server/services/backend/backend-render.service";

interface BackendRequestBody {
  url: string;
  timeout: number;
}

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      error: {
        code,
        message
      }
    },
    { status }
  );
}

function parseRequestBody(body: unknown): BackendRequestBody | null {
  if (!body || typeof body !== "object") return null;

  const candidate = body as { url?: unknown; timeout?: unknown };
  if (typeof candidate.url !== "string" || candidate.url.trim().length === 0) return null;
  if (typeof candidate.timeout !== "number" || !Number.isFinite(candidate.timeout) || candidate.timeout <= 0) {
    return null;
  }

  try {
    new URL(candidate.url);
  } catch {
    return null;
  }

  return {
    url: candidate.url.trim(),
    timeout: Number(candidate.timeout)
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Malformed JSON body");
  }

  const parsed = parseRequestBody(body);
  if (!parsed) {
    return jsonError(422, "invalid_request", "Validation failed");
  }

  try {
    const { image, susIndex } = await getBackendRenderResult(parsed);

    return NextResponse.json({
      status: "success",
      data: {
        image,
        sus_index: mapSusIndexToApi(susIndex)
      }
    });
  } catch (error) {
    if (error instanceof RendererTooManyRequestsError) {
      return jsonError(429, "too_many_requests", "Renderer is overloaded");
    }

    if (error instanceof RendererTimeoutError) {
      return jsonError(504, "upstream_timeout", "Renderer request timed out");
    }

    if (error instanceof RendererConfigError) {
      return jsonError(500, "misconfigured", "Renderer client is not configured");
    }

    if (error instanceof RendererRequestError) {
      return jsonError(502, "upstream_error", "Renderer request failed");
    }

    return jsonError(500, "internal_error", "Unexpected server error");
  }
}
