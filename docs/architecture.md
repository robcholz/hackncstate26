# Architecture

This document defines the target architecture and ownership boundaries.

References:
- `docs/api.md`: external API contracts and response shapes.
- `docs/implementations.md`: implementation rules and scoring logic.
- `docs/tasks.md`: execution checklist.

## Top-Level Structure

- `docs/`: product, API, architecture, implementation, and task docs.
- `renderer-server/`: website renderer microservice only.
- `fullstack/`: Next.js app and backend API gateway/orchestration.

## Service Boundaries

### renderer-server (microservice)

Responsibilities:
- expose `POST /api/v1/render`.
- verify renderer bearer token from `Authorization` header.
- reject missing/malformed token (`401`) and token mismatch (`403`).
- render screenshot from `url` + `timeout` and return base64 image.
- enforce overload/timeout behavior and return defined errors.

Non-responsibilities:
- phishing scoring.
- cache policy.
- cloud storage policy.
- final backend response shaping.

### fullstack (backend + frontend)

Responsibilities:
- expose backend API contract defined in `docs/api.md#backend`.
- orchestrate cache -> renderer -> fishing checker pipeline.
- map internal camelCase TypeScript models to snake_case API response fields.
- own final `sus_index` payload construction and response consistency.

## Fullstack Directory Architecture

- `fullstack/src/app/`: Next.js app router pages/layouts and route handlers.
- `fullstack/src/app/api/`: API route entrypoints.
- `fullstack/src/components/`: reusable UI components.
- `fullstack/src/hooks/`: reusable React hooks.
- `fullstack/src/lib/`: shared app helpers (non-domain).
- `fullstack/src/types/`: shared TS types for app-level usage.

- `fullstack/src/server/`: backend-only code.
- `fullstack/src/server/config/`: typed env loading and configuration validation.
- `fullstack/src/server/types/`: server-only domain and DTO types.
- `fullstack/src/server/routes/`: API route adapters/controllers.
- `fullstack/src/server/services/`: orchestration layer (composition of domains).
- `fullstack/src/server/domains/`: core business logic modules.
- `fullstack/src/server/clients/`: external service clients (renderer, cloud).
- `fullstack/src/server/mappers/`: camelCase <-> snake_case boundary mappers.
- `fullstack/src/server/lib/`: generic server utilities.

## Required Domain Modules (Fullstack)

### Image Cache Domain

Suggested path:
- `fullstack/src/server/domains/image-cache/`

Responsibilities:
- in-memory metadata cache keyed by link.
- TTL refresh timeout behavior.
- frequency-based eviction with max size.
- callback hooks for side effects.
- public API limited to:
  - `setRefreshTimeout(ms)`
  - `setCacheMaxSize(size)`
  - `putImage(image)`
  - `getImage(): Image`

### Cloudflare R2 Client

Suggested path:
- `fullstack/src/server/clients/cloudflare-r2/`

Responsibilities:
- read/write/delete image objects in R2.
- no cache policy logic.
- invoked via callback/hooks from cache or services.

### Website Renderer Client

Suggested path:
- `fullstack/src/server/clients/renderer/`

Responsibilities:
- call renderer microservice endpoint in `docs/api.md#website-renderer-microservice`.
- set `Authorization: Bearer <WEBSITE_RENDERER_TOKEN>`.
- expose minimal method: `getImage`.
- normalize client-side transport errors for service layer.

### Fishing Checker Domain

Suggested path:
- `fullstack/src/server/domains/fishing-checker/`

Responsibilities:
- expose only `getSusIndex(input): SusIndex`.
- manually resolve redirects from input URL.
- collect `redirectCount`, `finalUrl`, and HTML.
- compute normalized factors (`1-10`):
  - `domainSimilarity`
  - `keywordMatch`
  - `passwordInputMatch`
  - `redirectMatch`
- compute final normalized `rate` (`1-10`).
- return internal TS camelCase fields.

### API Mapping Boundary

Suggested path:
- `fullstack/src/server/mappers/sus-index.mapper.ts`

Responsibilities:
- map internal camelCase `SusIndex` to API snake_case fields:
  - `redirectMatch` -> `redirect_match`
  - `redirectCount` -> `redirect_count`
  - `domainSimilarity` -> `domain_similarity`
  - `keywordMatch` -> `keyword_match`
  - `passwordInputMatch` -> `password_input_match`

## Request Flow (Backend API)

1. Receive backend request (`url`, `timeout`).
2. Check image cache.
3. On miss/expired: fetch image via renderer client.
4. Run fishing checker using original URL (checker does manual redirects + HTML fetch internally).
5. Build response using snake_case API contract mapper.
6. Return `image` and `sus_index`.

## Configuration Ownership

Place under `fullstack/src/server/config/` with runtime validation:
- `WEBSITE_RENDERER_BASE_URL`
- `WEBSITE_RENDERER_TOKEN`
- cache refresh timeout default
- cache max size default
- fishing checker request timeout
- fishing checker max redirects

`renderer-server` should also validate:
- renderer token secret
- renderer concurrency/queue limits
- renderer default timeout

## Error Handling Strategy

- Keep external API error shapes aligned with `docs/api.md`.
- Normalize internal errors into typed categories in service layer:
  - auth/config errors
  - network/timeout errors
  - overload errors
  - validation errors
- Never leak internal stack traces in API responses.

## Testing Architecture

Place tests near each logic area, and keep test scope explicit:
- `fullstack/src/server/domains/**/*.test.ts`: domain unit tests.
- `fullstack/src/server/services/**/*.test.ts`: orchestration unit/integration tests.
- `fullstack/src/app/api/**/*.test.ts`: route contract tests.
- `fullstack/tests/integration/`: cross-module integration tests with mocks.
- `fullstack/tests/e2e/`: end-to-end API behavior tests.

Testing requirements:
- mock renderer and Cloudflare R2 dependencies in CI where required.
- include phishing checker false-positive/false-negative benchmark cases.
- target coverage as stated in `docs/tasks.md`.
