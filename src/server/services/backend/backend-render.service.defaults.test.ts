import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImageCacheApi } from "../../domains/image-cache/image-cache";

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

vi.mock("../../domains/image-cache/image-cache", () => ({
  getOrCreateImageCache: () => cacheMock
}));

vi.mock("../../clients/renderer/renderer-client", () => ({
  getOrCreateRendererClient: () => rendererClientMock
}));

vi.mock("../../domains/fishing-checker/fishing-checker", () => ({
  getSusIndex: (...args: unknown[]) => checkerMock(...args)
}));

import { getBackendRenderResult } from "./backend-render.service";

describe("getBackendRenderResult (default dependencies)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses default dependencies when deps are omitted", async () => {
    const susIndex = {
      rate: 4 as const,
      redirectMatch: 1 as const,
      redirectCount: 0,
      domainSimilarity: 5 as const,
      keywordMatch: 2 as const,
      passwordInputMatch: 1 as const
    };

    cacheMock.getImage = vi.fn().mockReturnValue(null);
    rendererClientMock.getImage.mockResolvedValue("from-renderer");
    checkerMock.mockResolvedValue(susIndex);

    const result = await getBackendRenderResult({ url: "https://default.example.com", timeout: 2500 });

    expect(result).toEqual({
      image: "from-renderer",
      susIndex
    });
    expect(cacheMock.getImage).toHaveBeenCalledWith("https://default.example.com");
    expect(cacheMock.putImage).toHaveBeenCalledWith({
      link: "https://default.example.com",
      image: "from-renderer"
    });
    expect(checkerMock).toHaveBeenCalledWith({
      url: "https://default.example.com",
      timeout: 2500
    });
  });
});
