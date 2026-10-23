# V1 build notes

V1 runs entirely on a Mac. Everything in `docs/PLAN.md` is implemented except the items under
"Not in V1" below. This file records where the build differs from the plan and why.

## Differences from the plan

| Plan | V1 | Why |
|---|---|---|
| Email/password register + login | Google Sign-In only (button + One Tap) | Product decision. `/auth/google` verifies the ID token's signature against Google's JWKS. |
| dj-rest-auth + allauth `GoogleLogin` (boilerplate) | Small custom view, allauth removed | allauth 0.58 decodes Google ID tokens **without verifying the signature**; with a browser-supplied `id_token` that lets anyone forge a login. |
| Django writes KV through the Cloudflare API; encoder uses R2's S3 API (aws-sdk-cpp) | Both go through the Worker's internal API (`/__internal/*`, bearer secret) | Same code path locally (`wrangler dev`) and in production; no Cloudflare credentials on the server; avoids building aws-sdk-cpp. |
| libpqxx | libpq (C API) | libpqxx 8 (Homebrew) and 7.8 (Ubuntu 24.04) have incompatible LISTEN APIs; libpq is identical on both. |
| `init.mp4` | `init_0.mp4` … `init_3.mp4` | What ffmpeg 7.1 actually writes with `-var_stream_map`. The Worker accepts both. |
| `-threads 2` before `-i` | `-threads N` as an output option | Before `-i` it only limits the decoder; the test encode used ~580% CPU. |
| tusd's 24 h expiry | `manage.py cleanup_uploads` (run hourly) | tusd v2 has no expiry option. |
| Uppy | `tus-js-client` (what Uppy wraps) + custom upload tray | Full control of the design; same resumable protocol. Re-adding the same file resumes its upload. |
| Hourly Analytics Engine pull | Production: `manage.py pull_usage`. Locally: the Worker posts each data point to `/internal/usage-ingest` | Analytics Engine isn't available offline. |
| New organizations need manual trial approval | Same, but `AUTO_APPROVE_TRIALS=true` in local `.env` | Convenience for development. Approve from Super admin → Customers. |

## Verified locally

- Upload (tus, resumed mid-file) → encode (4 renditions, live progress) → R2 → playback in the embed player.
- Domain whitelist: no-referer and foreign-referer requests get 403; allowed domain plays.
- Private videos: no token / tampered token → 403; signed link plays.
- Second request for a segment is an edge cache HIT.
- Suspending an organization stops playback; reactivating restores it.
- Bandwidth from playback is metered into `UsageDaily` and shown on the Usage page.
- Test suites: backend 27 (pytest), edge 5 (node:test), encoder unit tests.

## Not in V1 (needs V2 / production)

- Deploying the Worker, R2 bucket, KV namespace and Analytics Engine dataset (fill IDs in `edge/wrangler.toml`).
- nginx, systemd units, TLS, firewall, backups to R2, Sentry, disk alerts (`infra/` is empty for now).
- The plan's 3 GB upload test and 1.5-hour encode timing: this Mac had ~2.5 GB free disk.
- Real email delivery (local `.env` prints emails to the Django console).
- Scheduled jobs: run these by hand locally -
  `snapshot_storage` (nightly), `cleanup_uploads` (hourly), `generate_invoices` (1st of month), `pull_usage` (hourly, production only).
