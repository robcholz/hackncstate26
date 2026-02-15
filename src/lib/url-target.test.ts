import { describe, expect, it } from "vitest";

import { parseTargetUrl } from "./url-target";

describe("parseTargetUrl", () => {
  it("normalizes links without protocol to https", () => {
    const parsed = parseTargetUrl("example.com/security");
    expect(parsed).toEqual({
      ok: true,
      value: {
        normalizedUrl: "https://example.com/security",
        hostname: "example.com",
        protocol: "https:"
      }
    });
  });

  it("accepts encoded query parameter values", () => {
    const parsed = parseTargetUrl("https%3A%2F%2Fgithub.com%2Fopenai%3Ftab%3Dreadme");
    expect(parsed).toEqual({
      ok: true,
      value: {
        normalizedUrl: "https://github.com/openai?tab=readme",
        hostname: "github.com",
        protocol: "https:"
      }
    });
  });

  it("rejects unsupported protocols", () => {
    const parsed = parseTargetUrl("javascript:alert(1)");
    expect(parsed).toEqual({
      ok: false,
      error: "Only HTTP and HTTPS links are supported."
    });
  });

  it("strips hash fragments from output", () => {
    const parsed = parseTargetUrl("https://example.com/docs#section-a");
    expect(parsed).toEqual({
      ok: true,
      value: {
        normalizedUrl: "https://example.com/docs",
        hostname: "example.com",
        protocol: "https:"
      }
    });
  });

  it("returns a friendly error for empty input", () => {
    const parsed = parseTargetUrl("   ");
    expect(parsed).toEqual({
      ok: false,
      error: "Enter a URL to preview."
    });
  });
});
