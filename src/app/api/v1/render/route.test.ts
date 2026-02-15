import { describe, expect, it, vi } from "vitest";

import {
  RendererConfigError,
  RendererRequestError,
  RendererTimeoutError,
  RendererTooManyRequestsError
} from "../../../../server/clients/renderer/renderer-client";
import { getBackendRenderResult } from "../../../../server/services/backend/backend-render.service";
import { POST } from "./route";

vi.mock("../../../../server/services/backend/backend-render.service", () => ({
  getBackendRenderResult: vi.fn()
}));

const mockedGetBackendRenderResult = vi.mocked(getBackendRenderResult);

describe("POST /api/v1/render", () => {
  it("returns image and sus_index in backend API response shape", async () => {
    mockedGetBackendRenderResult.mockResolvedValueOnce({
      image: "base64-image",
      susIndex: {
        rate: 7,
        redirectMatch: 4,
        redirectCount: 1,
        domainSimilarity: 5,
        keywordMatch: 3,
        passwordInputMatch: 6
      }
    });

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://github.com", timeout: 3000 })
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "success",
      data: {
        image: "base64-image",
        sus_index: {
          rate: 7,
          redirect_match: 4,
          redirect_count: 1,
          domain_similarity: 5,
          keyword_match: 3,
          password_input_match: 6
        }
      }
    });
  });

  it("returns invalid_json when request body cannot be parsed", async () => {
    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-valid-json"
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "invalid_json",
        message: "Malformed JSON body"
      }
    });
  });

  it("returns too_many_requests when renderer is overloaded", async () => {
    mockedGetBackendRenderResult.mockRejectedValueOnce(new RendererTooManyRequestsError());

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://github.com", timeout: 3000 })
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(429);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "too_many_requests",
        message: "Renderer is overloaded"
      }
    });
  });

  it("returns invalid_request when body fails validation", async () => {
    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "not-a-valid-url", timeout: 3000 })
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "invalid_request",
        message: "Validation failed"
      }
    });
  });

  it("returns invalid_request when timeout is non-positive", async () => {
    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://github.com", timeout: 0 })
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "invalid_request",
        message: "Validation failed"
      }
    });
  });

  it("returns invalid_request when payload is not an object", async () => {
    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify("not-an-object")
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "invalid_request",
        message: "Validation failed"
      }
    });
  });

  it("returns invalid_request when url is missing", async () => {
    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeout: 3000 })
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "invalid_request",
        message: "Validation failed"
      }
    });
  });

  it("maps renderer timeout to upstream_timeout", async () => {
    mockedGetBackendRenderResult.mockRejectedValueOnce(new RendererTimeoutError());

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://github.com", timeout: 3000 })
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(504);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "upstream_timeout",
        message: "Renderer request timed out"
      }
    });
  });

  it("maps renderer config errors to misconfigured", async () => {
    mockedGetBackendRenderResult.mockRejectedValueOnce(new RendererConfigError("missing config"));

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://github.com", timeout: 3000 })
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "misconfigured",
        message: "Renderer client is not configured"
      }
    });
  });

  it("maps renderer request errors to upstream_error", async () => {
    mockedGetBackendRenderResult.mockRejectedValueOnce(new RendererRequestError("upstream failure", 502));

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://github.com", timeout: 3000 })
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "upstream_error",
        message: "Renderer request failed"
      }
    });
  });

  it("maps unknown errors to internal_error", async () => {
    mockedGetBackendRenderResult.mockRejectedValueOnce(new Error("unexpected"));

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://github.com", timeout: 3000 })
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "internal_error",
        message: "Unexpected server error"
      }
    });
  });
});
