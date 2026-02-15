# Tasks

## MVP

### Website Renderer Microservice

- [x] Implement `POST /api/v1/render` request handling (`url`, `timeout`).
- [x] Enforce bearer token auth via `Authorization` header.
- [x] Return `401 unauthorized` for missing/malformed auth header.
- [x] Return `403 forbidden` for token mismatch.
- [x] Render webpage screenshot and return base64 `image`.
- [x] Handle overload path and return `429 too_many_requests`.
- [x] Handle render timeout and return timeout-style error response.
- [x] Testing: add unit/integration tests for auth validation, render success path, overload handling, and timeout behavior.

### Backend API

- [x] Implement backend route response shape per `docs/api.md#backend`.
- [x] Check image cache before rendering.
- [x] On cache miss/expiry, call Website Renderer `getImage`.
- [x] Run Fishing Checker and attach `sus_index` in response.
- [x] Return `image` and `sus_index` with snake_case API fields.
- [x] Testing: add integration tests for backend response contract (`image` + `sus_index`) and error paths.

### Image Cache Logic

- [x] Implement in-memory metadata cache with key `<link>`.
- [x] Store `create_time` and expire items after refresh timeout (default 2 minutes).
- [x] Implement frequency-based eviction policy with max size (default 20).
- [x] Expose only `setRefreshTimeout(ms)`, `setCacheMaxSize(size)`, `putImage(image)`, `getImage(): Image`.
- [x] Add callback hooks so cache can trigger Cloudflare R2 sync without direct dependency.
- [x] Keep Cloudflare R2 API module separate from cache module.
- [x] Testing: add unit tests for eviction policy, refresh timeout, and callback behavior; mock Cloudflare R2 for CI.

## Stage 1

### Fishing Checker Logic

- [x] Expose one public function: `getSusIndex(input): SusIndex`.
- [x] Implement manual redirect flow inside checker starting from input `url`.
- [x] Track `redirectCount`, `finalUrl`, and final HTML body.
- [x] Add stop conditions: max redirects, timeout, redirect loop.
- [x] Implement confusable-domain detection with hardcoded ASCII, Unicode, and multi-char lookalike patterns.
- [x] Implement `domainSimilarity` scoring with `editScore`, `homoglyphScore`, `brandPrefixBonus`.
- [x] Implement hardcoded suspicious keyword list and `keywordMatch` scoring from HTML content.
- [x] Implement `passwordInputMatch` scoring from password/form patterns in HTML.
- [x] Implement `redirectMatch` scoring from `redirectCount`.
- [x] Implement normalized `rate` scoring from 4 factors (`1-10` clamp).
- [x] Add TS types (`Score1To10`, `SusIndex`) using camelCase internal fields.
- [x] Map camelCase internal fields to snake_case API response fields.
- [x] Testing: add unit tests for confusable-domain detection, keyword scoring, password input scoring, redirect scoring, and FP/FN benchmark cases.

### Final Wiring

- [x] Wire cache + renderer + checker in backend API route.
- [x] Ensure checker can run even if renderer output is unavailable for scoring signals.
- [x] Add safe defaults (`1`) for missing checker factors under timeout/fetch failure.
- [x] Testing: add end-to-end wiring tests with mocked external dependencies and confirm coverage target (>95% excluding Cloudflare R2 and Website Renderer logic).
