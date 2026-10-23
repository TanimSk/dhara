# Video hosting platform — technical plan

2026-10-23 · @tanim

## Overview

A multi-tenant, Bunny-style video hosting SaaS for Bangladeshi businesses (coaching centers first). The DigitalOcean droplet runs the dashboard, API and encoding. Cloudflare (Worker + R2) serves every byte of video, so bandwidth costs about ৳70 per TB instead of ৳600+ on Bunny.

### Locked decisions

| Area | Decision |
|---|---|
| Customers | Other businesses sign up as organizations (SaaS) |
| Teams | Each organization has members with roles (owner, admin, uploader) |
| Private videos | Customer's backend signs short-lived tokens with a library key (Bunny-style); the platform never stores their students |
| Anti-piracy v1 | Domain whitelist for embeds; signed tokens for private videos |
| Playback | Hosted iframe player + raw HLS URL for customers' own players and apps |
| Uploads | Resumable dashboard upload + REST API upload |
| Encoding | C++ worker driving ffmpeg, on the same $24 droplet as Django (on-demand encoder droplets later) |
| Analytics | Storage + bandwidth per customer and per video, daily |
| Billing | Fixed monthly plans with quotas + overage; invoices tracked in the dashboard, paid manually |
| Stack | React (frontend), Django + DRF (backend), C++/ffmpeg (encoder), Cloudflare Worker + R2 (delivery) |

### Expected scale

30–50 uploads a month, 200+ a year, each 2–4 GB (about 1–2 hours of class). Everything below is sized for this and scales out by adding encoder droplets later.

### Design rules

- The droplet never serves video bytes. Viewer traffic goes Worker → edge cache → R2.
- One R2 bucket, private, keyed by `library_id/video_id/...`. Only the Worker and the encoder can touch it.
- Cache keys never include the token, so every viewer of a video shares the same cached segments.
- Usage numbers come from our own metering (Worker + database), never estimated.

## System architecture

The droplet handles accounts, uploads and encoding; Cloudflare handles every viewer request. They share state through two narrow channels: Django pushes library and video config into Workers KV, and pulls usage totals back from Analytics Engine every hour.

_[architecture diagram — see original doc]_

The two lines between the boxes are config sync (Django → KV, on every save) and the hourly usage pull (Analytics Engine → Django). tusd tells Django when an upload finishes through its post-finish hook.

## Data model

PostgreSQL, one database. Organization is the tenant boundary: every query in the API filters by the caller's organization. Video libraries sit under an organization, like Bunny, so a customer can split courses or brands with different security settings.

| Model | Key fields | Notes |
|---|---|---|
| `User` | email, password, name | Django auth user; one person can belong to several organizations |
| `Organization` | name, slug, status (active / suspended), plan FK, created_at | The customer. Suspended = Worker returns 403 for all its videos |
| `Membership` | user FK, organization FK, role (owner / admin / uploader) | Owner: billing + members. Admin: everything except billing. Uploader: upload and edit videos only |
| `Invitation` | organization FK, email, role, token, expires_at | Email invite to join a team |
| `Library` | organization FK, name, security_key (secret), token_auth_enabled, allowed_domains (array), allow_direct_access (bool), default_privacy | Security settings live here; synced to Workers KV on save |
| `Video` | library FK, uuid, title, privacy (public / private), status (uploading / queued / encoding / ready / failed), duration_s, source_bytes, storage_bytes, width, height, renditions (JSON), thumbnail_key, error, created_by | `storage_bytes` = sum of all files in R2 for this video, written by the encoder |
| `EncodeJob` | video FK, status (queued / running / done / failed), progress (0–100), attempts, locked_by, heartbeat_at, started_at, finished_at, log_tail | Doubles as the job queue (see Encoding) |
| `ApiKey` | organization FK, name, prefix, key_hash, last_used_at, revoked_at | Shown once at creation; only the hash is stored |
| `Plan` | name, price_bdt, storage_gb, bandwidth_tb, max_members, overage_storage_bdt_per_gb, overage_bandwidth_bdt_per_tb, active | Editable from the super-admin panel |
| `UsageDaily` | organization FK, library FK, video FK (nullable), date, bytes_delivered, requests, storage_bytes | One row per video per day; rolled up for charts |
| `Invoice` | organization FK, period (month), plan snapshot (JSON), storage_gb_avg, bandwidth_tb, base_bdt, overage_bdt, total_bdt, status (draft / sent / paid), paid_at, note | Generated on the 1st; you mark it paid by hand |
| `PlatformCost` | month, item (droplet / workers / R2 storage / R2 ops / other), usd, bdt | Your real costs, for the profit dashboard |
| `AuditLog` | organization FK, user FK, action, target, metadata (JSON), created_at | Key rotations, deletions, member changes |

Storage on R2 uses this layout:

```
{library_id}/{video_uuid}/playlist.m3u8
{library_id}/{video_uuid}/{720p|480p|360p|240p}/video.m3u8
{library_id}/{video_uuid}/{720p|480p|360p|240p}/seg_00001.m4s
{library_id}/{video_uuid}/thumbnail.jpg
```

## Upload pipeline

Uploads use the tus resumable protocol, so a 4 GB upload over a Bangladeshi connection survives drops and continues where it stopped. Files land on the droplet's disk because the encoder runs there; nothing goes to R2 until it's encoded.

**Components**

- `tusd` (official Go binary) runs on the droplet behind nginx at `/upload/`. Stores chunks in `/data/uploads/`.
- Dashboard uses Uppy (`@uppy/react` + `@uppy/tus`) with a progress bar and resume after a page reload.
- API customers use any tus client (tus-js-client, tus-py-client) with their API key.

**Flow**

1. Client calls `POST /api/v1/libraries/{id}/videos` with a title. Django creates a `Video` (status `uploading`) and returns `video_id` + the tus endpoint.
2. Client uploads to `/upload/` with metadata `video_id` and an `Authorization` header (dashboard JWT or API key).
3. tusd **pre-create hook** → Django checks the caller can write to that library, the video is still `uploading`, and the file is under the 10 GB limit. Reject = 403.
4. tusd **post-finish hook** → Django records `source_bytes`, sets the video to `queued`, and inserts an `EncodeJob`.
5. Encoder picks up the job (next section).

**Rules**

- Max file size 10 GB, accepted containers: mp4, mov, mkv, webm. ffprobe validates before encoding; a non-video file fails the job with a clear error.
- tusd's expiry cleans up abandoned partial uploads after 24 hours.
- nginx: `client_max_body_size 0`, `proxy_request_buffering off` on `/upload/` so chunks stream to tusd.
- Disk: originals are deleted after a successful encode. The droplet has 80 GB of disk: allow at most 3 uploads in flight per organization and refuse new uploads when free space drops below 20 GB (each job needs the source plus ~3 GB of encoded output).

## Encoding pipeline

A small C++ daemon (`encoderd`) takes jobs from PostgreSQL, runs ffmpeg, uploads the result to R2 and updates the video. The big resource saving is decoding each source **once** and encoding all four qualities from that single decode, not the C++ itself. ffmpeg/x264 does the heavy lifting either way; C++ keeps the orchestrator tiny (a few MB of RAM) next to Django.

### Output ladder (H.264 + AAC, HLS with fMP4 segments)

| Rendition | Resolution | Max video bitrate | Audio |
|---|---|---|---|
| 720p | 1280×720 | 1,800 kbps | AAC 96 kbps |
| 480p | 854×480 | 900 kbps | AAC 96 kbps |
| 360p | 640×360 | 550 kbps | AAC 96 kbps |
| 240p | 426×240 | 300 kbps | AAC 96 kbps |

Capped CRF (`-crf 23` + per-rendition `-maxrate`) means static slides and whiteboard footage use far less than the cap. Only renditions at or below the source height are produced. Segments are 6 seconds with a keyframe every 2 seconds and no scene-cut keyframes, so quality switches and seeking are clean.

### Reference ffmpeg command (4 renditions, one decode)

```bash
nice -n 15 ffmpeg -hide_banner -y -i input.mp4 -threads 2 \
  -filter_complex "[0:v]split=4[a][b][c][d];[a]scale=-2:720[v0];[b]scale=-2:480[v1];[c]scale=-2:360[v2];[d]scale=-2:240[v3]" \
  -map "[v0]" -map "[v1]" -map "[v2]" -map "[v3]" -map 0:a:0 -map 0:a:0 -map 0:a:0 -map 0:a:0 \
  -c:v libx264 -preset veryfast -profile:v main -pix_fmt yuv420p -crf 23 \
  -maxrate:v:0 1800k -bufsize:v:0 3600k -maxrate:v:1 900k -bufsize:v:1 1800k \
  -maxrate:v:2 550k -bufsize:v:2 1100k -maxrate:v:3 300k -bufsize:v:3 600k \
  -g {2*fps} -keyint_min {2*fps} -sc_threshold 0 \
  -c:a aac -b:a 96k -ac 2 \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_type fmp4 -hls_flags independent_segments \
  -hls_fmp4_init_filename init.mp4 -hls_segment_filename "out/%v/seg_%05d.m4s" \
  -master_pl_name playlist.m3u8 \
  -var_stream_map "v:0,a:0,name:720p v:1,a:1,name:480p v:2,a:2,name:360p v:3,a:3,name:240p" \
  "out/%v/video.m3u8"
```

`encoderd` builds this command from the ffprobe result (fps, height, whether audio exists). Verify the exact flags against the installed ffmpeg version in Phase 3.

### Job queue (no Redis needed)

- Django inserts an `EncodeJob` and runs `NOTIFY encode_jobs`. `encoderd` `LISTEN`s and also polls every 30 s as a fallback.
- Claim: `SELECT ... FROM encode_job WHERE status='queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`, then set `running`, `locked_by`, `heartbeat_at`. Safe when you add more encoder droplets later.
- Heartbeat every 15 s. Any `running` job with a heartbeat older than 2 minutes is reset to `queued` (crash recovery).
- One job at a time on the shared droplet. Up to 3 attempts, then `failed` with the last 50 lines of ffmpeg output in `log_tail`.

### Worker steps

1. `ffprobe -print_format json` → duration, fps, height, audio presence. Reject files with no video stream.
2. Run ffmpeg with `-progress pipe:1`; parse `out_time_us` to update `progress` every few seconds (the dashboard shows it live).
3. Thumbnail: `ffmpeg -ss {10% of duration} -i input -frames:v 1 -vf scale=640:-2 thumbnail.jpg`.
4. Upload the output folder to R2 through its S3 API (8 parallel uploads), with `Cache-Control: public, max-age=31536000, immutable` on segments and init files.
5. Sum the uploaded bytes into `Video.storage_bytes`, save `renditions`, `duration_s`, `width`, `height`, set status `ready`.
6. Delete the source and scratch folder.

### C++ stack

C++20, CMake. Libraries: `libpqxx` (Postgres + LISTEN), `aws-sdk-cpp` (S3 component only, endpoint set to R2), `nlohmann/json` (ffprobe output), `spdlog` (logs). ffmpeg runs as a child process via `posix_spawn` with pipes. Configured by environment variables; runs as a systemd service with `Restart=always`.

### Expected speed

On the 2 vCPU droplet, budget roughly 1.5–3 hours to encode a 1.5-hour class into all four qualities; measure it in Phase 3. At 30–50 uploads a month that's about 2–4 hours of encoding a day, best run overnight.

When the wait gets too long, either resize to 4 vCPU ($48) or start a CPU-Optimized encoder droplet per job through the DigitalOcean API. It's billed per second (about $0.10–0.15 per class), pulls the source over the private network, and deletes itself after uploading to R2. The SKIP LOCKED queue already supports extra encoders; add a cleanup job that removes any encoder droplet older than 4 hours.

## Delivery and security

One Cloudflare Worker on `vid.<yourdomain>` handles every viewer request: the embed player page, playlists and segments. It checks access, serves from the edge cache, falls back to R2 (bound privately, no public bucket), and meters bytes per customer.

### URL scheme

| Use | URL |
|---|---|
| Embed player | `/embed/{library_id}/{video_id}?token=…&expires=…` |
| Public HLS | `/{library_id}/{video_id}/playlist.m3u8` |
| Private HLS | `/t/{token}/{expires}/{library_id}/{video_id}/playlist.m3u8` |
| Thumbnail | `/{library_id}/{video_id}/thumbnail.jpg` |

The token sits in the **path**, not the query string. Playlists reference segments by relative URLs, so every segment request automatically carries the token, with no playlist rewriting.

### Signed tokens (private videos)

- `token = base64url(HMAC-SHA256(library.security_key, "{library_id}/{video_id}/{expires}"))`, no padding.
- `expires` = Unix timestamp. Recommended TTL: video duration + 1 hour, so playback doesn't break mid-class.
- The token covers one whole video (all qualities and segments), never other videos.
- Customers sign on their own server; the key never reaches the browser. Rotating the key in the dashboard invalidates all live links instantly.
- Worker compares in constant time and rejects expired or malformed tokens with 403.

Customer-side signing (shown in the dashboard with their real IDs filled in):

```python
import base64, hashlib, hmac, time

def signed_embed_url(library_id, video_id, key, ttl=4 * 3600):
    exp = int(time.time()) + ttl
    msg = f"{library_id}/{video_id}/{exp}".encode()
    sig = hmac.new(key.encode(), msg, hashlib.sha256).digest()
    tok = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"https://vid.example.com/embed/{library_id}/{video_id}?token={tok}&expires={exp}"
```

```php
$exp = time() + 14400;
$tok = rtrim(strtr(base64_encode(hash_hmac('sha256', "$lib/$vid/$exp", $key, true)), '+/', '-_'), '=');
$url = "https://vid.example.com/embed/$lib/$vid?token=$tok&expires=$exp";
```

### Domain whitelist

Two layers, both driven by `Library.allowed_domains` (exact hosts or `*.example.com`):

1. **Embed page:** the Worker sends `Content-Security-Policy: frame-ancestors <allowed domains>`. Browsers refuse to show the player inside any other site. This can't be bypassed in a real browser.
2. **HLS and segments:** the Worker checks the `Origin`/`Referer` host against the allowed list plus the player's own host. Empty referer is allowed only when `allow_direct_access` is on (needed for customers' mobile apps).

Referer can be faked outside a browser, so the whitelist stops embedding and hotlinking on other websites. Signed tokens are what actually protect private videos. Tell customers to use both for paid courses.

### Worker request flow

1. Parse the path; anything malformed → 404.
2. Read config from Workers KV: `lib:{library_id}` (org status, allowed domains, token required, direct access, security key) and `vid:{video_id}` (library, privacy, status). Django writes these on every save, so the Worker never calls the droplet.
3. Organization suspended → 403. Video missing or not `ready` → 404. Deleting a video removes its KV entry, so it stops playing immediately without a cache purge.
4. Private video or token-required library → verify the token.
5. Domain check (above). CORS: echo the `Origin` only if it's allowed.
6. Cache lookup with a key **without** `/t/{token}/{expires}`, so all viewers share one cached copy. On a miss, `env.BUCKET.get(key)`, return it, and `ctx.waitUntil(cache.put(...))`.
7. Headers: segments and init `max-age=31536000, immutable`; playlists `max-age=3600`; correct `Content-Type` for `.m3u8`, `.m4s`, `.mp4`, `.jpg`.
8. `ctx.waitUntil(env.USAGE.writeDataPoint(...))` with organization, library, video, bytes sent, cache hit or miss (see Usage metering).

### Embed player

A small static HTML page served by the Worker: hls.js plus a lightweight UI (Plyr or Video.js), quality selector, playback speed (1×–2×, important for classes), keyboard shortcuts, and resume position stored in the viewer's browser. It builds the private HLS URL from the token in its own query string. No dependency on the droplet, so the dashboard can be down and videos still play.

## Usage metering and cost analytics

Bandwidth is measured at the edge by the Worker; storage is measured from our own database. Both land in `UsageDaily`, which feeds every chart and invoice.

### Bandwidth

- Every response writes one data point to a Workers Analytics Engine dataset `video_usage`: index = organization ID; blobs = organization, library, video, cache status (HIT/MISS), country; doubles = bytes sent, 1 request.
- A Django job runs hourly, queries the Analytics Engine SQL API grouped by organization, library, video and day, and upserts `UsageDaily`. Always sum `_sample_interval * double1` so the totals stay correct if Cloudflare samples at high volume.
- Analytics Engine keeps about 3 months of raw points; our database is the permanent record.

### Storage

- Nightly job writes each ready video's `storage_bytes` into that day's `UsageDaily` row.
- Monthly storage for billing = average of the daily totals (GB-month), the same way R2 bills us.

### Cost model (what each customer actually costs you)

| Item | Rate | Driven by |
|---|---|---|
| R2 storage | $0.015 / GB-month (first 10 GB free) | Storage |
| Worker requests | $0.30 / million after 10 M included | Every playlist + segment request |
| Analytics Engine writes | $0.25 / million after 10 M included | Same requests |
| R2 reads | $0.36 / million after 10 M free | Cache misses only |
| Bandwidth | $0 | — |

A 6-second segment averages about 1 MB, so 1 TB delivered ≈ 1 million requests ≈ $0.55 ≈ **৳70 per TB**. Fixed costs (droplet, Workers Paid $5) are entered monthly in `PlatformCost` and split across customers by bandwidth share on the profit page.

### Dashboards

- **Customer:** storage now and over 30 days, bandwidth per day, top 10 videos by bandwidth, usage bars against plan quota, estimated bill for the current month.
- **Super-admin (you):** every customer's plan, storage, bandwidth, revenue, estimated cost and margin; platform revenue vs real costs for the month with progress toward the ৳2,000 profit target; alerts for customers above 80% of quota.
- **Monthly check:** compare our storage and request totals with Cloudflare's own billing figures. A gap over 5% means a metering bug.

## Plans, pricing and profit

Two Growth customers clear the ৳2,000 monthly profit target on the $24 droplet, and each plan still costs customers about half of Bunny's cheapest network. Figures use $1 ≈ ৳123. DigitalOcean backups are not used; the nightly database dump to R2 covers recovery.

### Fixed monthly costs

| Item | USD | BDT |
|---|---|---|
| DigitalOcean Basic droplet, 2 vCPU / 4 GB / 80 GB (Bangalore) | $24 | ৳2,950 |
| Cloudflare Workers Paid | $5 | ৳615 |
| Domain + email (approx.) | — | ৳150 |
| **Total** | **~$29** | **~৳3,700** |

### Plans

| Plan | Price / month | Storage | Bandwidth | Team members | Your cost at full quota | Contribution |
|---|---|---|---|---|---|---|
| Starter | ৳2,500 | 100 GB | 5 TB | 3 | ৳535 | ৳1,965 |
| Growth | ৳5,000 | 300 GB | 15 TB | 10 | ৳1,605 | ৳3,395 |
| Pro | ৳9,000 | 800 GB | 40 TB | 25 | ৳4,280 | ৳4,720 |

Overage: ৳6 per GB-month of storage, ৳250 per TB of bandwidth. Annual prepay: 2 months free. 14-day trial capped at 20 GB storage and 200 GB bandwidth, no card needed (you approve trials by hand).

"Your cost at full quota" assumes the customer uses every GB and TB; most use less, so real margins are higher.

### When you hit the target

You need ৳3,700 (fixed) + ৳2,000 (profit) = **৳****5,70****0 of contribution** a month. Any of these gets there:

- 2 Growth customers → ৳6,790
- 3 Starter customers → ৳5,895
- 1 Pro + 1 Starter → ৳6,685

Example, one large customer: 1 TB stored and 30 TB streamed costs you about ৳7,650 in total (৳3,700 fixed + ~৳1,830 storage + ~৳2,100 bandwidth). On Pro plus 200 GB of overage they pay ৳10,200, leaving about ৳2,550 profit.

Resize to the 4 vCPU droplet ($48) or add on-demand encoder droplets (Encoding pipeline) when videos wait more than a few hours to encode.

### Why customers pick it over Bunny

A coaching center with 1,000 students streaming ~15 TB and storing 300 GB would pay roughly ৳9,600/month on Bunny's Volume network and several times that on its Standard network. On Growth they pay ৳5,000 in taka, with local support and no dollar card needed. The 1,000-student, 20-classes-a-month case from earlier (~30 TB) fits Pro.

## React dashboard

One React app serves both the customer dashboard and your super-admin panel (separate route tree, staff-only). Layout follows Bunny: left sidebar of libraries, video grid in the middle, settings as tabs.

**Stack:** Vite + React + TypeScript, React Router, TanStack Query (server state, polling encode progress), shadcn/ui + Tailwind, Recharts (usage charts), Uppy with tus (uploads), hls.js (preview player). Auth: JWT access + refresh tokens from Django (`djangorestframework-simplejwt`), refresh token in an httpOnly cookie.

### Customer pages

| Page | What it does | Roles |
|---|---|---|
| Sign up / log in / accept invite | Create organization or join one by invite link | All |
| Organization switcher | Switch between organizations a user belongs to | All |
| Libraries | List, create, rename libraries | Owner, admin |
| Video list | Grid with thumbnail, title, duration, status badge, live encode progress, privacy; search, sort, bulk delete | All |
| Upload | Drag-and-drop, multiple files, resumable, per-file progress, title edit | All |
| Video detail | Preview player, embed code (iframe), HLS URL, privacy toggle, token URL generator for testing, replace thumbnail, delete, per-video bandwidth chart | All; delete = owner/admin |
| Library settings → Security | Allowed domains, require tokens, allow direct access, show/rotate security key, signing code samples | Owner, admin |
| API keys | Create (shown once), name, revoke, last used | Owner, admin |
| Team | Invite by email, change role, remove | Owner |
| Usage | Storage and bandwidth charts, top videos, quota bars | Owner, admin |
| Billing | Current plan, this month's estimate, past invoices (status, download PDF) | Owner |

### Super-admin pages (you)

| Page | What it does |
|---|---|
| Customers | All organizations with plan, usage, revenue, margin; suspend / reactivate; change plan |
| Plans | Create and edit plans and overage rates |
| Invoices | Monthly drafts, adjust, mark sent / paid, add note (bKash TrxID) |
| Platform costs | Enter monthly droplet and Cloudflare bills |
| Profit | Revenue vs cost this month, target progress, 12-month trend |
| Encoder | Job queue, running job progress, failed jobs with logs, retry button |

### UX details worth building in

- Encode progress updates every 3 s while a video is `encoding` (TanStack Query polling); no websockets needed.
- Leaving the page during an upload warns the user; Uppy's Golden Retriever plugin resumes after a reload.
- Copy buttons on embed code, HLS URL and API keys.
- Bangla-friendly: Taka formatting (৳1,23,456) on all money.

## API surface

Django REST Framework under `/api/v1/`. The dashboard and customers' servers use the same endpoints; the dashboard authenticates with JWT, servers with `Authorization: Bearer <api key>`. API keys are scoped to one organization and can't touch team, billing or keys. OpenAPI docs generated by `drf-spectacular` and published for customers.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/login`, `/auth/refresh` | Accounts (dashboard only) |
| GET / POST | `/libraries` | List, create libraries |
| GET / PATCH / DELETE | `/libraries/{id}` | Library details and security settings |
| POST | `/libraries/{id}/rotate-key` | New security key; old tokens stop working |
| GET / POST | `/libraries/{id}/videos` | List videos (filter by status, search); create a video and get its upload URL |
| GET / PATCH / DELETE | `/videos/{id}` | Details (status, progress, renditions, URLs), rename, change privacy, delete |
| POST | `/videos/{id}/thumbnail` | Upload a custom thumbnail |
| POST | `/videos/{id}/reencode` | Re-run encoding (staff, or after a failure) |
| GET | `/usage?from=&to=&group=day\|video` | Storage and bandwidth for the organization |
| GET / POST / DELETE | `/api-keys` | Manage API keys (dashboard only) |
| GET / POST / PATCH / DELETE | `/members`, `/invitations` | Team (dashboard only) |
| GET | `/billing/current`, `/invoices` | Plan, estimate, invoices (dashboard only) |
| POST | `/internal/tusd-hooks` | tusd pre-create / post-finish (localhost only) |
| `/admin-api/...` |  | Super-admin endpoints (staff only) |

Uploading the file itself goes to the tus endpoint returned by `POST /libraries/{id}/videos`. Rate limit API keys at 120 requests per minute with DRF throttling.

## Infrastructure and deployment

One Basic droplet (2 vCPU / 4 GB / 80 GB, $24) in DigitalOcean's Bangalore region, closest to Bangladesh so 4 GB uploads go fastest, plus Cloudflare for everything viewer-facing. No DigitalOcean backups: the nightly `pg_dump` to R2 covers the database, and videos already live in R2.

### On the droplet (Ubuntu 24.04, systemd services)

| Service | Role |
|---|---|
| nginx | TLS (Let's Encrypt), routes `/api/` to Django, `/upload/` to tusd, serves the React build |
| gunicorn + Django | API and admin, 2 workers |
| PostgreSQL 16 | Database + encode job queue |
| tusd | Resumable uploads to `/data/uploads` |
| encoderd (C++) | Encoding worker, `nice 15`, one job at a time |
| systemd timers | Hourly usage pull, nightly storage snapshot, monthly invoices on the 1st, nightly `pg_dump` to a separate private R2 bucket |

Firewall (`ufw`): only 22, 80, 443 open. tusd hooks and Postgres listen on localhost only.

### On Cloudflare

- Domain DNS on Cloudflare; `app.<domain>` (dashboard, proxied to the droplet) and `vid.<domain>` (Worker route).
- R2 bucket `videos` with the APAC location hint, no public access. R2 API token scoped to that bucket for the encoder and Django.
- Workers KV namespace `CONFIG` (library and video config), Analytics Engine dataset `video_usage`, Workers Paid plan.
- Cache rules: segments and init files cached at the edge for a year; Tiered Cache on.
- Billing notifications for R2 and Workers usage.

### Repository layout (one monorepo)

```
/backend    Django project (apps: accounts, orgs, libraries, videos, usage, billing, adminpanel)
/frontend   React + Vite app
/encoder    C++ encoderd (CMake)
/edge       Cloudflare Worker + embed player (wrangler)
/infra      nginx, systemd units, tusd config, setup scripts
/docs       This plan, API docs, runbooks
```

### Ops basics

- Sentry (free tier) for Django, React and Worker errors; an uptime monitor on `app.` and a test video URL on `vid.`.
- Alert when disk is above 75% (stuck uploads or failed cleanup).
- Deploy: GitHub Actions → SSH deploy for backend/frontend/encoder; `wrangler deploy` for the Worker.

## Build phases for Claude agent

Build in eight phases, one agent session each. Phase 4 is the first point where a real video plays end to end. Before Phase 1, export this doc into `/docs/PLAN.md` and add a `CLAUDE.md` at the repo root with the conventions below. Start each session with: "Read docs/PLAN.md and CLAUDE.md, then implement Phase N. Stop when its done-when checks pass."

1. **Foundation**
   - Monorepo skeleton, Django project with custom User, `Organization`, `Membership`, `Invitation`, JWT auth, organization-scoped permission classes, Postgres, pytest.
   - React app shell: login, sign up, organization switcher, sidebar layout.
   - Done when: a user signs up, creates an organization, invites a second user as uploader, and the uploader can't reach owner-only endpoints (tests cover it).

2. **Libraries, videos and keys**
   - `Library`, `Video`, `ApiKey` models and endpoints; security key generation and rotation; API key auth; Django signal that writes `lib:` and `vid:` entries to Workers KV through the Cloudflare API.
   - Done when: CRUD works from the dashboard and with an API key, and KV shows updated config within seconds of a save.

3. **Upload and encoding**
   - tusd + nginx config and hooks; Uppy upload page; C++ `encoderd` (queue claim, heartbeat, ffprobe, ffmpeg ladder, progress, thumbnail, R2 upload, cleanup); retry and crash recovery.
   - Done when: a 3 GB file uploads with one forced disconnect, resumes, encodes into the ladder in R2, and the dashboard shows live progress then `ready`. Record the encode time for a 1.5-hour class.

4. **Edge delivery and player**
   - Worker: routing, KV config, token verification, domain whitelist, CSP `frame-ancestors`, token-free cache key, R2 fallback, headers, CORS; embed player page with hls.js.
   - Done when: a public video plays on an allowed domain and is blocked when embedded on another; a private video plays only with a valid unexpired token; a second request for the same segment returns `cf-cache-status: HIT`; `/cdn-cgi/trace` from Bangladesh shows a nearby colo.

5. **Dashboard completeness**
   - Video detail page, embed and HLS copy, token URL generator, security settings with code samples, team page, API keys page.
   - Done when: a new customer can go from sign-up to an embedded private video on their own site without help.

6. **Usage metering**
   - Analytics Engine writes in the Worker; hourly pull job; nightly storage snapshot; `UsageDaily`; usage charts and quota bars.
   - Done when: after streaming a known file 10 times, recorded bytes match within 2%.

7. **Plans, invoices and super-admin**
   - `Plan`, `Invoice`, `PlatformCost`; monthly invoice job with overage; billing page; super-admin customers, invoices, costs, profit and encoder pages; suspend flows through KV.
   - Done when: a test month produces correct invoices for three sample customers, and suspending a customer stops their playback within a minute.

8. **Hardening and launch**
   - Rate limits, audit log, Sentry, backups to R2 and a tested restore, disk alerts, load test (300 concurrent viewers on one video), public API docs.
   - Done when: the load test plays without errors from the edge and the droplet's CPU stays flat during it.


### Conventions for CLAUDE.md

- Every API query filters by the request's organization; add a test for cross-organization access on every new endpoint.
- Secrets only from environment variables; never log security keys, tokens or API keys.
- Money stored as integer paisa; bytes as 64-bit integers; times in UTC, shown in Asia/Dhaka.
- No video bytes ever go through Django or nginx except tus uploads.

## Risks and later features

| Risk | Impact | Mitigation |
|---|---|---|
| Encoding slows the dashboard on the shared droplet | Slow API during encodes | `nice 15`, `-threads ``2`, one job at a time; move `encoderd` to its own droplet when the queue waits more than a few hours (the SKIP LOCKED queue already supports it) |
| Screen recording of private classes | Piracy | Out of scope for v1 (domain whitelist + tokens only). Next: dynamic watermark with the viewer's name/phone, then AES-128 HLS encryption |
| Cloudflare routes Bangladeshi viewers to a far data center | Slower start-up | Test from GP, Robi and broadband in Phase 4; the 240p rung keeps playback going on weak links |
| Customer abuse (hosting non-class content, huge uploads) | Cost spike | Quotas, 10 GB file limit, manual trial approval, suspend switch |
| Metering bug under-bills customers | Lost revenue | Monthly reconciliation against Cloudflare's billing (Usage metering section) |
| Droplet disk fills with stuck uploads | Uploads fail | tusd 24 h expiry, cleanup after encode, 75% disk alert |
| R2 has no spending cap | Surprise bill | Cloudflare billing notifications; quotas per customer |

### Later (not in v1)

- Dynamic viewer watermark and AES-128 encryption (most-requested anti-piracy features for coaching centers).
- Webhooks on encode finish, fetch-from-URL uploads, views and watch-time analytics.
- Automated billing through bKash / SSLCommerz, prepaid credit option.
- Captions/subtitle upload, chapters, multiple audio tracks.
- On-demand encoder droplets (per-second billing, ~$0.10–0.15 per class) once the 2 vCPU droplet can't keep up.
