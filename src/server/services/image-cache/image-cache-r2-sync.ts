import type { CloudflareR2Api } from "../../clients/cloudflare-r2/cloudflare-r2";
import {
  createImageCache,
  type CacheRemoveReason,
  type ImageCacheApi,
  type ImageCacheEntry,
  type ImageCacheHooks
} from "../../domains/image-cache/image-cache";

export interface ImageCacheR2SyncErrorContext {
  operation: "put" | "delete";
  link: string;
  reason?: CacheRemoveReason;
}

export interface ImageCacheR2SyncOptions {
  onSyncError?: (error: unknown, context: ImageCacheR2SyncErrorContext) => void;
  refreshTimeoutMs?: number;
  maxSize?: number;
}

const createErrorHandler =
  (options: ImageCacheR2SyncOptions) =>
  (error: unknown, context: ImageCacheR2SyncErrorContext): void => {
    options.onSyncError?.(error, context);
  };

export function createImageCacheR2Hooks(r2: CloudflareR2Api, options: ImageCacheR2SyncOptions = {}): ImageCacheHooks {
  const onError = createErrorHandler(options);

  const syncPut = (entry: ImageCacheEntry): void => {
    void r2.putImage(entry).catch((error) => {
      onError(error, { operation: "put", link: entry.link });
    });
  };

  const syncDelete = (entry: ImageCacheEntry, reason: CacheRemoveReason): void => {
    void r2.deleteImage(entry.link).catch((error) => {
      onError(error, { operation: "delete", link: entry.link, reason });
    });
  };

  return {
    onPut: syncPut,
    onRemove: syncDelete
  };
}

export function createImageCacheWithR2Sync(r2: CloudflareR2Api, options: ImageCacheR2SyncOptions = {}): ImageCacheApi {
  const cache = createImageCache(createImageCacheR2Hooks(r2, options));

  if (options.refreshTimeoutMs) {
    cache.setRefreshTimeout(options.refreshTimeoutMs);
  }

  if (options.maxSize) {
    cache.setCacheMaxSize(options.maxSize);
  }

  return cache;
}
