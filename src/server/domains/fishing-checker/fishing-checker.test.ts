import { afterEach, describe, expect, it, vi } from "vitest";

import { getSusIndex } from "./fishing-checker";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response("", {
    status,
    headers: {
      location
    }
  });
}

describe("getSusIndex", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("follows redirects manually and tracks redirect count", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectResponse("https://safe.test/next"))
      .mockResolvedValueOnce(redirectResponse("https://safe.test/final", 301))
      .mockResolvedValueOnce(htmlResponse("<html><body>Hello</body></html>"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://safe.test/start", timeout: 2000 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
    expect(result.redirectCount).toBe(2);
    expect(result.redirectMatch).toBe(5);
  });

  it("flags suspicious content with phishing keywords and password patterns", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <head><title>Security Alert</title></head>
          <body>
            <p>Verify your account now. Urgent action required.</p>
            <p>Unusual activity detected. Reset password now.</p>
            <form action="https://attacker.test/collect" method="post">
              <input type="hidden" name="email" value="person@example.com" />
              <input type="password" name="password" />
            </form>
          </body>
        </html>
      `)
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://secure-paypa1.com/login", timeout: 2000 });

    expect(result.keywordMatch).toBeGreaterThanOrEqual(7);
    expect(result.passwordInputMatch).toBeGreaterThanOrEqual(9);
    expect(result.domainSimilarity).toBeGreaterThanOrEqual(7);
    expect(result.rate).toBeGreaterThanOrEqual(7);
  });

  it("returns safe defaults when network fetch fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://github.com", timeout: 500 });

    expect(result.redirectCount).toBe(0);
    expect(result.redirectMatch).toBe(1);
    expect(result.keywordMatch).toBe(1);
    expect(result.passwordInputMatch).toBe(1);
    expect(result.domainSimilarity).toBe(1);
    expect(result.rate).toBe(1);
  });

  it("keeps benign pages at low suspiciousness", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <head><title>Documentation</title></head>
          <body>
            <h1>Welcome to docs</h1>
            <p>No account verification here.</p>
          </body>
        </html>
      `)
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://example.org/docs", timeout: 2000 });

    expect(result.keywordMatch).toBeLessThanOrEqual(3);
    expect(result.passwordInputMatch).toBe(1);
    expect(result.rate).toBeLessThanOrEqual(4);
  });
});
