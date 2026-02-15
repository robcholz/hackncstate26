# UI Metrics Contract

This document defines what metrics the preview UI is allowed to render.

Source of truth:

- `docs/api.md#backend`

If `sus_index` is present, the UI should render only these keys:

- `rate`
- `redirect_match`
- `redirect_count`
- `domain_similarity`
- `keyword_match`
- `password_input_match`

No additional phishing metrics should be added to UI unless they are first added to `docs/api.md`.
