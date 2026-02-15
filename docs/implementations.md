# Implementations

## Definitions

## Website Renderer

1. If the server is full, it will dispose of all the incoming connections and return error.
2. If an item is timeout, dispose of them and return an error.

See: [website_renderer](website_renderer.mmd) for architecture.

Also see: [api.md#website-renderer-microservice](api.md#website-renderer-microservice) for API details.

## Backend

Going to be deployed on Vercel.

See: [api.md#backend](api.md#backend) for API details.

When implementing that API, it should first check if the image is cached.

### Image Cache Logic

The Cloudflare R2 envs should be stored in .env.

Each image should have a cache, key is `<link>`. value is a metadata. Currently, it should contain: the
`create_time`, which is a unix timestamp representing the time this image is created. By default, the lifetime is 2
minutes. Any image older than this will be removed and reconstructed. Meanwhile, when the image is added or removed from
the cache, it is also removed from the Cloudflare R2. You can say the cache is an alias of Cloudflare R2.

Besides it, the cache itself is a frequency-based cache policy. Currently, let's set the max size for the cache to be
20; beyond the CACHE_MAX_SIZE, the cache policy will replace the least used item with the new item.

Cloudflare R2 apis and the image cache apis should be in two files and do not depend on each other.

Image cache apis should only expose `setRefreshTimeout(ms)`, `setCacheMaxSize(size)`, `putImage(image)`,
`getImage():Image`.

All the logics here should expose minimal public functions. You should provide a callback function so Cloudflare R2
operation functions can be called when needed, while the image cache logic does not depend on Cloudflare R2.

### Website Renderer Logic

The Website Renderer token should be set in .env.

This file should use api: [api.md#website-renderer-microservice](api.md#website-renderer-microservice) to interact with
the Website Preview Renderer. Similarly, expose only logic `getImage`.


