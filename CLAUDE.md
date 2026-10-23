# dhara

Bunny-style video hosting SaaS for Bangladeshi educators. The full technical plan is `docs/PLAN.md`;
deviations made while building V1 are in `docs/V1-NOTES.md`. Read both before changing architecture.

## Layout
- `backend/` - Django + DRF (style follows github.com/tanimSk/DRFBoilerplate: class-based `APIView`s,
  `{"success": ..., "message": ...}` responses, `administrator.serializers.custom_exception_handler`,
  `utils.shared.StandardResultsSetPagination`). Apps: administrator (User, auth, super-admin API),
  organizations, libraries, videos, usage, billing.
- `edge/` - Cloudflare Worker: player page, playlists/segments with token + domain checks, edge cache,
  R2, usage metering, and the internal API (`/__internal/*`) Django and encoderd use for KV and R2.
- `encoder/` - `encoderd` (C++20, libpq, libcurl): claims jobs with `FOR UPDATE SKIP LOCKED`, runs one
  ffmpeg decode into the HLS ladder, uploads via the Worker, marks the video ready.
- `frontend/` - Vite + React + TS + Tailwind v4. Design tokens live in `src/index.css`; UI kit in
  `src/components/ui.tsx`. Keep the white-matte, Apple/Claude look: near-black pill buttons, Instrument
  Serif for display headlines only, clay (`--color-clay`) as a sparing accent.
- `bin/setup` once, then `bin/dev` runs Django :8000, tusd :1080, wrangler :8787, encoderd, Vite :5173.

## Conventions
- Every API query filters by the request's organization (`organizations.permissions.resolve_organization`);
  add a test for cross-organization access on every new endpoint.
- Secrets only from environment variables; never log security keys, tokens or API keys.
- Money stored as integer paisa; bytes as 64-bit integers; times in UTC, shown in Asia/Dhaka.
- No video bytes ever go through Django except tus uploads (thumbnails are the small exception).
- Customers sign in with Google only. ID tokens are verified against Google's JWKS
  (`administrator/google.py`) - never trust an unverified token.

## Tests
- `cd backend && .venv/bin/pytest`
- `cd edge && npm test`
- `encoder/build/encoderd_tests`
- `cd frontend && npx tsc -b`
