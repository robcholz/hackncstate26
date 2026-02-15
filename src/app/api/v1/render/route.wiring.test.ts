import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImageCacheApi } from "../../../../server/domains/image-cache/image-cache";
import { RendererRequestError } from "../../../../server/clients/renderer/renderer-client";
import { POST } from "./route";

const cacheMock: ImageCacheApi = {
  setRefreshTimeout: vi.fn(),
  setCacheMaxSize: vi.fn(),
  putImage: vi.fn((input) => ({
    link: input.link,
    image: input.image,
    createTime: Date.now()
  })),
  getImage: vi.fn()
};

const rendererClientMock = {
  getImage: vi.fn()
};

const checkerMock = vi.fn();

vi.mock("../../../../server/domains/image-cache/image-cache", () => ({
  getOrCreateImageCache: () => cacheMock
}));

vi.mock("../../../../server/domains/fishing-checker/fishing-checker", () => ({
  getSusIndex: (...args: unknown[]) => checkerMock(...args)
}));

vi.mock("../../../../server/clients/renderer/renderer-client", async () => {
  const actual = await vi.importActual<typeof import("../../../../server/clients/renderer/renderer-client")>(
    "../../../../server/clients/renderer/renderer-client"
  );

  return {
    ...actual,
    getOrCreateRendererClient: () => rendererClientMock
  };
});

describe("POST /api/v1/render (wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wires route through cache miss, renderer fetch, and checker", async () => {
    cacheMock.getImage = vi.fn().mockReturnValue(null);
    rendererClientMock.getImage.mockResolvedValue("renderer-base64");
    checkerMock.mockResolvedValue({
      rate: 8,
      redirectMatch: 6,
      redirectCount: 2,
      domainSimilarity: 7,
      keywordMatch: 8,
      passwordInputMatch: 6
    });

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://wiring.example.com", timeout: 2500 })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "success",
      data: {
        image: "renderer-base64",
        sus_index: {
          rate: 8,
          redirect_match: 6,
          redirect_count: 2,
          domain_similarity: 7,
          keyword_match: 8,
          password_input_match: 6
        }
      }
    });
    expect(cacheMock.getImage).toHaveBeenCalledWith("https://wiring.example.com");
    expect(rendererClientMock.getImage).toHaveBeenCalledWith({
      url: "https://wiring.example.com",
      timeout: 2500
    });
    expect(cacheMock.putImage).toHaveBeenCalledWith({
      link: "https://wiring.example.com",
      image: "renderer-base64"
    });
    expect(checkerMock).toHaveBeenCalledWith({
      url: "https://wiring.example.com",
      timeout: 2500
    });
  });

  it("returns cached image while still executing checker", async () => {
    cacheMock.getImage = vi.fn().mockReturnValue({
      link: "https://cached.example.com",
      image: "cached-base64",
      createTime: 1
    });
    rendererClientMock.getImage.mockResolvedValue("renderer-base64");
    checkerMock.mockResolvedValue({
      rate: 6,
      redirectMatch: 4,
      redirectCount: 1,
      domainSimilarity: 6,
      keywordMatch: 5,
      passwordInputMatch: 5
    });

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://cached.example.com", timeout: 3000 })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.image).toBe("cached-base64");
    expect(rendererClientMock.getImage).not.toHaveBeenCalled();
    expect(checkerMock).toHaveBeenCalledWith({
      url: "https://cached.example.com",
      timeout: 3000
    });
  });

  it("uses safe checker defaults when checker fails during wiring", async () => {
    cacheMock.getImage = vi.fn().mockReturnValue(null);
    rendererClientMock.getImage.mockResolvedValue("renderer-base64");
    checkerMock.mockRejectedValue(new Error("checker exploded"));

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://safe-default.example.com", timeout: 1800 })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.sus_index).toEqual({
      rate: 1,
      redirect_match: 1,
      redirect_count: 0,
      domain_similarity: 1,
      keyword_match: 1,
      password_input_match: 1
    });
  });

  it("maps renderer request failures while still invoking checker", async () => {
    cacheMock.getImage = vi.fn().mockReturnValue(null);
    rendererClientMock.getImage.mockRejectedValue(new RendererRequestError("renderer down", 502));
    checkerMock.mockResolvedValue({
      rate: 4,
      redirectMatch: 1,
      redirectCount: 0,
      domainSimilarity: 4,
      keywordMatch: 3,
      passwordInputMatch: 2
    });

    const request = new Request("http://localhost/api/v1/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://renderer-fail.example.com", timeout: 2000 })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "upstream_error",
        message: "Renderer request failed"
      }
    });
    expect(checkerMock).toHaveBeenCalledWith({
      url: "https://renderer-fail.example.com",
      timeout: 2000
    });
  });
});
