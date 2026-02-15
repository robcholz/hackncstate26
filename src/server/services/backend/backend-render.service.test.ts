import { describe, expect, it, vi } from "vitest";

import type { RendererClient } from "../../clients/renderer/renderer-client";
import type { SusIndex } from "../../domains/fishing-checker/fishing-checker";
import type { ImageCacheApi, ImageCacheEntry } from "../../domains/image-cache/image-cache";
import { getBackendRenderResult } from "./backend-render.service";

function createCacheMock(cached: ImageCacheEntry | null): ImageCacheApi {
  return {
    setRefreshTimeout: vi.fn(),
    setCacheMaxSize: vi.fn(),
    putImage: vi.fn((input) => ({
      link: input.link,
      image: input.image,
      createTime: Date.now()
    })),
    getImage: vi.fn(() => cached)
  };
}

const sampleSusIndex: SusIndex = {
  rate: 6,
  redirectMatch: 4,
  redirectCount: 1,
  domainSimilarity: 6,
  keywordMatch: 5,
  passwordInputMatch: 7
};

describe("getBackendRenderResult", () => {
  it("returns cached image and still runs checker", async () => {
    const cache = createCacheMock({
      link: "https://example.com",
      image: "cached-base64",
      createTime: 1
    });

    const rendererClient: RendererClient = {
      getImage: vi.fn().mockResolvedValue("renderer-base64")
    };

    const checker = vi.fn().mockResolvedValue(sampleSusIndex);

    const result = await getBackendRenderResult(
      { url: "https://example.com", timeout: 3000 },
      { cache, rendererClient, checker }
    );

    expect(result.image).toBe("cached-base64");
    expect(result.susIndex).toEqual(sampleSusIndex);
    expect(cache.getImage).toHaveBeenCalledWith("https://example.com");
    expect(rendererClient.getImage).not.toHaveBeenCalled();
    expect(checker).toHaveBeenCalledWith({ url: "https://example.com", timeout: 3000 });
  });

  it("calls renderer on cache miss and stores the image", async () => {
    const cache = createCacheMock(null);
    const rendererClient: RendererClient = {
      getImage: vi.fn().mockResolvedValue("renderer-base64")
    };
    const checker = vi.fn().mockResolvedValue(sampleSusIndex);

    const result = await getBackendRenderResult(
      { url: "https://miss.example.com", timeout: 3500 },
      { cache, rendererClient, checker }
    );

    expect(rendererClient.getImage).toHaveBeenCalledWith({
      url: "https://miss.example.com",
      timeout: 3500
    });
    expect(cache.putImage).toHaveBeenCalledWith({
      link: "https://miss.example.com",
      image: "renderer-base64"
    });
    expect(result.image).toBe("renderer-base64");
    expect(result.susIndex).toEqual(sampleSusIndex);
  });

  it("uses safe checker defaults when checker throws", async () => {
    const cache = createCacheMock(null);
    const rendererClient: RendererClient = {
      getImage: vi.fn().mockResolvedValue("renderer-base64")
    };
    const checker = vi.fn().mockRejectedValue(new Error("checker failed"));

    const result = await getBackendRenderResult(
      { url: "https://safe-defaults.example.com", timeout: 3000 },
      { cache, rendererClient, checker }
    );

    expect(result.image).toBe("renderer-base64");
    expect(result.susIndex).toEqual({
      rate: 1,
      redirectMatch: 1,
      redirectCount: 0,
      domainSimilarity: 1,
      keywordMatch: 1,
      passwordInputMatch: 1
    });
  });
});
