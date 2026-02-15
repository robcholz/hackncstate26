import { describe, expect, it, vi } from "vitest";

import { RendererTooManyRequestsError } from "../../../../server/clients/renderer/renderer-client";
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
});
