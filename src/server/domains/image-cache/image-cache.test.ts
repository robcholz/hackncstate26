import { describe, expect, it, vi } from "vitest";

import { createImageCache, getOrCreateImageCache } from "./image-cache";

describe("createImageCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-15T10:00:00.000Z"));
    globalThis.__imageCache__ = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.__imageCache__ = undefined;
  });

  it("stores and returns an image by link", () => {
    const cache = createImageCache();
    cache.putImage({ link: "https://example.com", image: "abc" });

    const item = cache.getImage("https://example.com");
    expect(item).not.toBeNull();
    expect(item?.image).toBe("abc");
    expect(item?.link).toBe("https://example.com");
  });

  it("expires items after refresh timeout", () => {
    const cache = createImageCache();
    cache.setRefreshTimeout(1000);
    cache.putImage({ link: "https://expired.com", image: "old" });

    vi.advanceTimersByTime(1001);

    const item = cache.getImage("https://expired.com");
    expect(item).toBeNull();
  });

  it("evicts least-frequently-used item when max size is reached", () => {
    const cache = createImageCache();
    cache.setCacheMaxSize(2);

    cache.putImage({ link: "https://a.com", image: "A" });
    cache.putImage({ link: "https://b.com", image: "B" });

    cache.getImage("https://a.com");
    cache.getImage("https://a.com");

    cache.putImage({ link: "https://c.com", image: "C" });

    expect(cache.getImage("https://a.com")?.image).toBe("A");
    expect(cache.getImage("https://b.com")).toBeNull();
    expect(cache.getImage("https://c.com")?.image).toBe("C");
  });

  it("runs hooks for put, update, and eviction", () => {
    const events: string[] = [];
    const cache = createImageCache({
      onPut: (entry) => events.push(`put:${entry.link}`),
      onRemove: (entry, reason) => events.push(`remove:${reason}:${entry.link}`)
    });

    cache.setCacheMaxSize(1);
    cache.putImage({ link: "https://a.com", image: "A" });
    cache.putImage({ link: "https://a.com", image: "A2" });
    cache.putImage({ link: "https://b.com", image: "B" });

    expect(events).toEqual([
      "put:https://a.com",
      "remove:updated:https://a.com",
      "put:https://a.com",
      "remove:evicted:https://a.com",
      "put:https://b.com"
    ]);
  });

  it("removes expired items when refresh timeout is reduced", () => {
    const cache = createImageCache();
    cache.putImage({ link: "https://a.com", image: "A" });

    vi.advanceTimersByTime(5000);
    cache.setRefreshTimeout(1000);

    expect(cache.getImage("https://a.com")).toBeNull();
  });

  it("throws for invalid API arguments", () => {
    const cache = createImageCache();

    expect(() => cache.setRefreshTimeout(0)).toThrow();
    expect(() => cache.setCacheMaxSize(0)).toThrow();
    expect(() => cache.putImage({ link: "", image: "A" })).toThrow();
    expect(() => cache.putImage({ link: "https://x.com", image: "" })).toThrow();
    expect(() => cache.getImage("")).toThrow();
  });

  it("prunes expired entries before enforcing max size updates", () => {
    const events: string[] = [];
    const cache = createImageCache({
      onRemove: (entry, reason) => events.push(`${reason}:${entry.link}`)
    });

    cache.setRefreshTimeout(1000);
    cache.putImage({ link: "https://a.com", image: "A" });
    cache.putImage({ link: "https://b.com", image: "B" });

    vi.advanceTimersByTime(1001);
    cache.setCacheMaxSize(1);

    expect(cache.getImage("https://a.com")).toBeNull();
    expect(cache.getImage("https://b.com")).toBeNull();
    expect(events).toEqual(["expired:https://a.com", "expired:https://b.com"]);
  });

  it("reuses singleton cache instance for next.js runtime", () => {
    const first = getOrCreateImageCache();
    const second = getOrCreateImageCache();

    expect(first).toBe(second);

    first.putImage({ link: "https://singleton.com", image: "cached" });
    expect(second.getImage("https://singleton.com")?.image).toBe("cached");
  });
});
