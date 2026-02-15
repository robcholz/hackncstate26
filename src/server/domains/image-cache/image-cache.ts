export interface ImageCacheEntry {
  link: string;
  image: string;
  createTime: number;
}

export interface ImageCacheHooks {
  onPut?: (entry: ImageCacheEntry) => void;
  onRemove?: (entry: ImageCacheEntry, reason: CacheRemoveReason) => void;
}

export interface PutImageInput {
  link: string;
  image: string;
}

export interface ImageCacheApi {
  setRefreshTimeout: (ms: number) => void;
  setCacheMaxSize: (size: number) => void;
  putImage: (image: PutImageInput) => ImageCacheEntry;
  getImage: (link: string) => ImageCacheEntry | null;
}

export type CacheRemoveReason = "expired" | "evicted" | "updated";

interface CacheNode {
  entry: ImageCacheEntry;
  frequency: number;
}

const DEFAULT_REFRESH_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_CACHE_MAX_SIZE = 20;

export function createImageCache(hooks: ImageCacheHooks = {}): ImageCacheApi {
  let refreshTimeoutMs = DEFAULT_REFRESH_TIMEOUT_MS;
  let cacheMaxSize = DEFAULT_CACHE_MAX_SIZE;
  const store = new Map<string, CacheNode>();

  const now = () => Date.now();

  const isExpired = (entry: ImageCacheEntry, ts: number): boolean => ts - entry.createTime >= refreshTimeoutMs;

  const removeEntry = (link: string, reason: CacheRemoveReason): void => {
    const node = store.get(link);
    if (!node) return;

    store.delete(link);
    hooks.onRemove?.(node.entry, reason);
  };

  const pruneExpired = (): void => {
    const ts = now();

    for (const [link, node] of store.entries()) {
      if (isExpired(node.entry, ts)) {
        removeEntry(link, "expired");
      }
    }
  };

  const findLeastFrequentlyUsedLink = (): string | null => {
    let bestLink: string | null = null;
    let bestFrequency = Number.POSITIVE_INFINITY;
    let bestCreateTime = Number.POSITIVE_INFINITY;

    for (const [link, node] of store.entries()) {
      if (node.frequency < bestFrequency) {
        bestLink = link;
        bestFrequency = node.frequency;
        bestCreateTime = node.entry.createTime;
        continue;
      }

      if (node.frequency === bestFrequency && node.entry.createTime < bestCreateTime) {
        bestLink = link;
        bestCreateTime = node.entry.createTime;
      }
    }

    return bestLink;
  };

  const ensureMaxSize = (): void => {
    while (store.size > cacheMaxSize) {
      const linkToEvict = findLeastFrequentlyUsedLink();
      if (!linkToEvict) return;

      removeEntry(linkToEvict, "evicted");
    }
  };

  const setRefreshTimeout = (ms: number): void => {
    if (!Number.isFinite(ms) || ms <= 0) {
      throw new Error("refresh timeout must be a positive finite number");
    }

    refreshTimeoutMs = ms;
    pruneExpired();
  };

  const setCacheMaxSize = (size: number): void => {
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error("cache max size must be a positive integer");
    }

    cacheMaxSize = size;
    pruneExpired();
    ensureMaxSize();
  };

  const putImage = (image: PutImageInput): ImageCacheEntry => {
    if (!image.link || typeof image.link !== "string") {
      throw new Error("image.link must be a non-empty string");
    }

    if (typeof image.image !== "string" || image.image.length === 0) {
      throw new Error("image.image must be a non-empty string");
    }

    pruneExpired();

    if (store.has(image.link)) {
      removeEntry(image.link, "updated");
    }

    const entry: ImageCacheEntry = {
      link: image.link,
      image: image.image,
      createTime: now()
    };

    store.set(image.link, { entry, frequency: 1 });
    ensureMaxSize();
    hooks.onPut?.(entry);
    return entry;
  };

  const getImage = (link: string): ImageCacheEntry | null => {
    if (!link || typeof link !== "string") {
      throw new Error("link must be a non-empty string");
    }

    pruneExpired();

    const node = store.get(link);
    if (!node) return null;

    const ts = now();
    if (isExpired(node.entry, ts)) {
      removeEntry(link, "expired");
      return null;
    }

    node.frequency += 1;
    return node.entry;
  };

  return {
    setRefreshTimeout,
    setCacheMaxSize,
    putImage,
    getImage
  };
}

declare global {
  var __imageCache__: ImageCacheApi | undefined;
}

/**
 * Next.js dev mode reloads modules frequently. Using globalThis preserves the
 * in-memory cache across hot reloads while still creating one process-local cache.
 */
export function getOrCreateImageCache(hooks: ImageCacheHooks = {}): ImageCacheApi {
  if (!globalThis.__imageCache__) {
    globalThis.__imageCache__ = createImageCache(hooks);
  }

  return globalThis.__imageCache__;
}
