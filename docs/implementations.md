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

### Fishing Checker Logic

See: [api.md#backend](api.md#backend) for output contract.

TypeScript code should use camelCase field names:

- `rate`
- `redirectMatch`
- `redirectCount`
- `domainSimilarity`
- `keywordMatch`
- `passwordInputMatch`

API responses still use snake_case; map at the API boundary.

The checker module should expose only one public function:

- `getSusIndex(input): SusIndex`

Recommended input shape:

- `url`: original requested url

Manual redirect + HTML collection requirement:

- `getSusIndex` must perform its own HTTP request flow and follow redirects manually.
- Do not rely on Website Renderer output for phishing scoring signals.
- Use redirect mode/manual behavior (or equivalent) and iterate `Location` headers.
- Track:
  - `redirectCount`
  - `finalUrl`
  - final response HTML body (if content type is HTML)
- Stop conditions:
  - max redirects reached (recommend `10`)
  - timeout reached
  - redirect loop detected
- If HTML cannot be fetched, keep scoring with available signals and default missing factors safely.

Hardcoded suspicious-character map (homoglyph groups):

- ASCII confusables:
  - `a A`: `4 @`
  - `b B`: `8`
  - `e E`: `3`
  - `g G`: `9`
  - `i I l L`: `1 | !`
  - `o O`: `0`
  - `s S`: `5 $`
  - `t T`: `7`
  - `z Z`: `2`
- Unicode confusables (common in phishing domains):
  - Cyrillic: `а А е Е о О р Р с С у У х Х і І ј Ј` vs Latin lookalikes
  - Greek: `Α α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ` vs Latin lookalikes
- Multi-character lookalikes:
  - `rn` <-> `m`
  - `cl` <-> `d`
  - `vv` <-> `w`
  - `li` <-> `h`
  - `00` <-> `o0` (digit/letter blends)
- Detection requirement:
  - check both single-char substitutions and multi-char lookalike patterns against trusted domains.
  - if confusable substitutions are present in brand-like hostnames, increase `homoglyphScore` aggressively.

Hardcoded suspicious keyword list:

- `verify your account`
- `confirm password`
- `password expired`
- `security alert`
- `unusual activity`
- `unlock account`
- `sign in now`
- `billing update`
- `payment failed`
- `suspended`
- `urgent action required`
- `click here`
- `reset password`
- `2fa disabled`

Rating rules (all factors normalized to `1-10`):

1. `domainSimilarity`:
   - normalize host (`punycode -> unicode`), strip `www`.
   - do not assume lowercase-only input; evaluate confusables with case-preserving matching.
   - compare against trusted domains (for example: `microsoft.com`, `google.com`, `apple.com`, `paypal.com`,
     `amazon.com`, `github.com`).
   - calculate:
     - `editScore`: similarity to nearest trusted domain (normalized Levenshtein/Jaro-Winkler).
     - `homoglyphScore`: count of confusable substitutions and pair patterns (`rn` vs `m`, etc.).
     - `brandPrefixBonus`: suspicious boost if host starts with a known brand token but domain is not exact.
   - final:
     - `rawScore = 0.5*editScore + 0.35*homoglyphScore + 0.15*brandPrefixBonus`
     - normalize to `1-10`; clamp integer.
2. `keywordMatch`:
   - extract visible text + meta/title from `html`.
   - count unique keyword hits and weighted repeats.
   - normalize:
     - 0 hits -> `1`
     - 1-2 hits -> `3-5`
     - 3-5 hits -> `6-8`
     - 6+ hits -> `9-10`
3. `passwordInputMatch`:
   - parse DOM and detect:
     - `input[type=password]`
     - forms posting to external/suspicious origins
     - hidden username/email + password combos
   - normalize:
     - no password field -> `1`
     - password field only -> `7`
     - password field + suspicious form action/patterns -> `9-10`
4. `redirectMatch`:
   - use observed `redirectCount`.
   - normalize:
     - 0 redirects -> `1`
     - 1 redirect -> `3`
     - 2 redirects -> `5`
     - 3 redirects -> `7`
     - 4+ redirects -> `9-10`

Final rate (`1-10`):

- weighted combination of the 4 factors:
  - `rateRaw = 0.40*domainSimilarity + 0.25*keywordMatch + 0.20*passwordInputMatch + 0.15*redirectMatch`
- `rate = clamp(round(rateRaw), 1, 10)`

Return shape (TypeScript):

```ts
export type Score1To10 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface SusIndex {
  rate: Score1To10;
  redirectMatch: Score1To10;
  redirectCount: number; // >= 0
  domainSimilarity: Score1To10;
  keywordMatch: Score1To10;
  passwordInputMatch: Score1To10;
}
```

Backend integration order:

1. Check image cache first (as defined above).
2. If miss/expired, call Website Renderer `getImage`.
3. Call Fishing Checker `getSusIndex` using only the original `url`; checker resolves redirects and fetches HTML
   internally.
4. Return backend response with `image` and `sus_index` per [api.md#backend](api.md#backend) by mapping from camelCase
   TS fields.

Non-functional requirements:

- Keep module stateless and deterministic for same input.
- Keep checker independent from cache and renderer modules.
- Add time budget; if checker exceeds timeout, return safe defaults (`1`) for missing factors without failing request.

### Final Logic

You should wire everything up and define them in the API route.

### Testing

Make sure use TDD and try to avoid false positive, and false negative in the test. When try to test the Cloudflare R2
logic and Website Renderer Logic, use mock tests so it can run inside CI. Make sure the coverage besides Cloudflare R2
and Website Renderer Logic is >95%, if you think it is difficult to acheive this, let me know.
