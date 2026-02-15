import { describe, expect, it, vi } from "vitest";

import type { CloudflareR2Api } from "../../clients/cloudflare-r2/cloudflare-r2";
import { createImageCacheWithR2Sync } from "./image-cache-r2-sync";

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("createImageCacheWithR2Sync", () => {
  it("syncs put and delete operations to the R2 client via hooks", async () => {
    const r2: CloudflareR2Api = {
      putImage: vi.fn().mockResolvedValue(undefined),
      getImage: vi.fn().mockResolvedValue(null),
      deleteImage: vi.fn().mockResolvedValue(undefined)
    };

    const cache = createImageCacheWithR2Sync(r2, {
      maxSize: 1,
      refreshTimeoutMs: 1000
    });

    cache.putImage({ link: "https://a.com", image: "A" });
    cache.putImage({ link: "https://b.com", image: "B" });

    await flush();

    expect(r2.putImage).toHaveBeenCalledTimes(2);
    expect(r2.deleteImage).toHaveBeenCalledTimes(1);
    expect(r2.deleteImage).toHaveBeenCalledWith("https://a.com");
  });

  it("reports R2 sync errors through onSyncError", async () => {
    const putError = new Error("put-failed");
    const deleteError = new Error("delete-failed");

    const r2: CloudflareR2Api = {
      putImage: vi.fn().mockRejectedValue(putError),
      getImage: vi.fn().mockResolvedValue(null),
      deleteImage: vi.fn().mockRejectedValue(deleteError)
    };

    const onSyncError = vi.fn();
    const cache = createImageCacheWithR2Sync(r2, {
      onSyncError,
      maxSize: 1
    });

    cache.putImage({ link: "https://x.com", image: "X" });
    cache.putImage({ link: "https://y.com", image: "Y" });

    await flush();

    expect(onSyncError).toHaveBeenCalledTimes(3);
    expect(onSyncError).toHaveBeenCalledWith(putError, {
      operation: "put",
      link: "https://x.com"
    });
    expect(onSyncError).toHaveBeenCalledWith(deleteError, {
      operation: "delete",
      link: "https://x.com",
      reason: "evicted"
    });
  });

  it("does not delete from R2 when cache entry is updated in place", async () => {
    const r2: CloudflareR2Api = {
      putImage: vi.fn().mockResolvedValue(undefined),
      getImage: vi.fn().mockResolvedValue(null),
      deleteImage: vi.fn().mockResolvedValue(undefined)
    };

    const cache = createImageCacheWithR2Sync(r2);
    cache.putImage({ link: "https://same.com", image: "v1" });
    cache.putImage({ link: "https://same.com", image: "v2" });

    await flush();

    expect(r2.putImage).toHaveBeenCalledTimes(2);
    expect(r2.deleteImage).not.toHaveBeenCalled();
  });

  it("validates explicit zero-valued options", () => {
    const r2: CloudflareR2Api = {
      putImage: vi.fn().mockResolvedValue(undefined),
      getImage: vi.fn().mockResolvedValue(null),
      deleteImage: vi.fn().mockResolvedValue(undefined)
    };

    expect(() => createImageCacheWithR2Sync(r2, { refreshTimeoutMs: 0 })).toThrow();
    expect(() => createImageCacheWithR2Sync(r2, { maxSize: 0 })).toThrow();
  });
});
