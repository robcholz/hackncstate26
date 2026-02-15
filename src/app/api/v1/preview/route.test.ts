import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import type { LinkPreview } from "@/lib/link-preview";
import { getLinkPreview } from "@/lib/link-preview";
import { GET } from "./route";

vi.mock("@/lib/link-preview", () => ({
  getLinkPreview: vi.fn()
}));

const mockedGetLinkPreview = vi.mocked(getLinkPreview);

describe("GET /api/v1/preview", () => {
  beforeEach(() => {
    mockedGetLinkPreview.mockReset();
  });

  it("returns mocked success payload for a valid URL", async () => {
    const mockData: LinkPreview = {
      url: "https://example.com/login",
      hostname: "example.com",
      title: "Preview: example.com",
      summary: "Mock summary",
      image: null,
      sus_index: {
        rate: 6,
        redirect_match: 3,
        redirect_count: 1,
        domain_similarity: 7,
        keyword_match: 4,
        password_input_match: 5
      },
      fetchedAt: "2026-02-15T00:00:00.000Z"
    };

    mockedGetLinkPreview.mockResolvedValue(mockData);

    const request = new NextRequest("http://localhost/api/v1/preview?url=https://example.com/login");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedGetLinkPreview).toHaveBeenCalledWith("https://example.com/login");
    expect(body).toEqual({
      status: "success",
      data: mockData
    });
  });

  it("decodes encoded URL values before calling preview service", async () => {
    const mockData: LinkPreview = {
      url: "https://github.com/openai",
      hostname: "github.com",
      title: "Preview: github.com",
      summary: "Mock summary",
      image: null,
      sus_index: {
        rate: 4,
        redirect_match: 1,
        redirect_count: 0,
        domain_similarity: 3,
        keyword_match: 5,
        password_input_match: 2
      },
      fetchedAt: "2026-02-15T00:00:00.000Z"
    };

    mockedGetLinkPreview.mockResolvedValue(mockData);

    const request = new NextRequest(
      "http://localhost/api/v1/preview?url=https%253A%252F%252Fgithub.com%252Fopenai"
    );
    await GET(request);

    expect(mockedGetLinkPreview).toHaveBeenCalledWith("https://github.com/openai");
  });

  it("returns 422 for invalid URL input", async () => {
    const request = new NextRequest("http://localhost/api/v1/preview?url=javascript:alert(1)");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(mockedGetLinkPreview).not.toHaveBeenCalled();
    expect(body).toEqual({
      status: "error",
      error: {
        code: "invalid_request",
        message: "Only HTTP and HTTPS links are supported."
      }
    });
  });
});
