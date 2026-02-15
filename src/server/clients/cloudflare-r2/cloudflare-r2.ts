export interface CloudflareR2ImageObject {
  link: string;
  image: string;
  createTime: number;
}

export interface CloudflareR2Api {
  putImage: (image: CloudflareR2ImageObject) => Promise<void>;
  getImage: (link: string) => Promise<CloudflareR2ImageObject | null>;
  deleteImage: (link: string) => Promise<void>;
}

export interface CloudflareR2Config {
  bucket: string;
  keyPrefix?: string;
}

export interface CloudflareR2Provider {
  putObject: (input: {
    bucket: string;
    key: string;
    body: string;
    contentType: string;
    metadata: Record<string, string>;
  }) => Promise<void>;
  getObject: (input: { bucket: string; key: string }) => Promise<{
    body: string;
    metadata?: Record<string, string>;
  } | null>;
  deleteObject: (input: { bucket: string; key: string }) => Promise<void>;
}

const DEFAULT_CONTENT_TYPE = "text/plain";

export function makeCloudflareR2ObjectKey(link: string, keyPrefix = ""): string {
  if (!link || typeof link !== "string") {
    throw new Error("link must be a non-empty string");
  }

  const normalizedPrefix = keyPrefix.trim().replace(/^\/+|\/+$/g, "");
  const encoded = encodeURIComponent(link);
  return normalizedPrefix ? `${normalizedPrefix}/${encoded}` : encoded;
}

export function createCloudflareR2Api(config: CloudflareR2Config, provider: CloudflareR2Provider): CloudflareR2Api {
  if (!config.bucket || typeof config.bucket !== "string") {
    throw new Error("config.bucket must be a non-empty string");
  }

  const putImage: CloudflareR2Api["putImage"] = async (image) => {
    if (!image.link || typeof image.link !== "string") {
      throw new Error("image.link must be a non-empty string");
    }

    if (!image.image || typeof image.image !== "string") {
      throw new Error("image.image must be a non-empty string");
    }

    if (!Number.isFinite(image.createTime) || image.createTime <= 0) {
      throw new Error("image.createTime must be a positive finite number");
    }

    const key = makeCloudflareR2ObjectKey(image.link, config.keyPrefix);
    await provider.putObject({
      bucket: config.bucket,
      key,
      body: image.image,
      contentType: DEFAULT_CONTENT_TYPE,
      metadata: {
        link: image.link,
        createTime: String(image.createTime)
      }
    });
  };

  const getImage: CloudflareR2Api["getImage"] = async (link) => {
    const key = makeCloudflareR2ObjectKey(link, config.keyPrefix);
    const object = await provider.getObject({ bucket: config.bucket, key });
    if (!object) {
      return null;
    }

    const metadata = object.metadata ?? {};
    const createTimeFromMetadata = Number(metadata.createTime);

    return {
      link: metadata.link ?? link,
      image: object.body,
      createTime:
        Number.isFinite(createTimeFromMetadata) && createTimeFromMetadata > 0 ? createTimeFromMetadata : Date.now()
    };
  };

  const deleteImage: CloudflareR2Api["deleteImage"] = async (link) => {
    const key = makeCloudflareR2ObjectKey(link, config.keyPrefix);
    await provider.deleteObject({ bucket: config.bucket, key });
  };

  return {
    putImage,
    getImage,
    deleteImage
  };
}
