// dhara edge Worker: serves every viewer request (player, playlists, segments, thumbnails)
// from the edge cache, falling back to R2. Config comes from Workers KV, written by Django.
//
// Internal API (/__internal/*, bearer INTERNAL_SECRET) lets Django and encoderd write KV and R2
// without holding Cloudflare credentials.

import { frameAncestors, isAllowed, requester, trustedHosts, hostMatches } from "./domains.js";
import { timingSafeEqual, verifyToken } from "./token.js";
import { renderPlayer, renderMessage } from "./player.js";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE = "(playlist\\.m3u8|thumbnail\\.jpg|\\d{3,4}p/(?:video\\.m3u8|init(?:_\\d+)?\\.mp4|seg_\\d{5}\\.m4s))";
const RE_EMBED = new RegExp(`^/embed/(\\d+)/(${UUID})/?$`);
const RE_PRIVATE = new RegExp(`^/t/([A-Za-z0-9_-]{43})/(\\d{1,12})/(\\d+)/(${UUID})/${FILE}$`);
const RE_PUBLIC = new RegExp(`^/(\\d+)/(${UUID})/${FILE}$`);

const CONTENT_TYPES = {
  m3u8: "application/vnd.apple.mpegurl",
  m4s: "video/iso.segment",
  mp4: "video/mp4",
  jpg: "image/jpeg",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/__internal/")) return await internal(request, env, url);
      if (request.method === "OPTIONS") return preflight(request, env, url);
      if (request.method !== "GET" && request.method !== "HEAD") return text("Method not allowed", 405);

      let m;
      if ((m = url.pathname.match(RE_EMBED))) return await embed(request, env, url, m[1], m[2]);
      if ((m = url.pathname.match(RE_PRIVATE))) return await asset(request, env, ctx, url, m[3], m[4], m[5], { token: m[1], expires: m[2] });
      if ((m = url.pathname.match(RE_PUBLIC))) return await asset(request, env, ctx, url, m[1], m[2], m[3], null);
      if (url.pathname === "/" || url.pathname === "/health") return text("dhara edge ok", 200);
      return text("Not found", 404);
    } catch (err) {
      console.error(err);
      return text("Internal error", 500);
    }
  },
};

// ---------- config ----------

async function loadConfig(env, libraryId, videoId) {
  const [lib, vid] = await Promise.all([
    env.CONFIG.get(`lib:${libraryId}`, { type: "json" }),
    env.CONFIG.get(`vid:${videoId}`, { type: "json" }),
  ]);
  if (!lib) return { error: 404 };
  if (lib.org_status === "suspended") return { error: 403, lib };
  // A video plays only when it's ready (Django removes the KV entry otherwise) and in this library.
  if (!vid || String(vid.lib) !== String(libraryId)) return { error: 404, lib };
  return { lib, vid };
}

function needsToken(lib, vid) {
  return Boolean(vid.private || lib.token);
}

// ---------- embed player ----------

async function embed(request, env, url, libraryId, videoId) {
  const { lib, vid, error } = await loadConfig(env, libraryId, videoId);
  if (error === 403) return html(renderMessage("This video is unavailable", "The publisher's account is paused."), 403);
  if (error) return html(renderMessage("Video not found", "It may have been moved or deleted."), 404);

  const headers = {
    "Content-Security-Policy": `frame-ancestors ${frameAncestors(env, lib)}`,
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  // The page that frames the player sends its address as Referer; enforce the whitelist here too.
  if (!isAllowed(request, env, lib)) {
    return html(renderMessage("Playback isn't allowed here", "This video can only be watched on the publisher's website."), 403, headers);
  }

  const token = url.searchParams.get("token");
  const expires = url.searchParams.get("expires");
  let base = `/${libraryId}/${videoId}`;
  if (needsToken(lib, vid)) {
    const ok = await verifyToken(lib.key, libraryId, videoId, token, expires);
    if (!ok) return html(renderMessage("This link has expired", "Reload the page you came from to get a fresh one."), 403, headers);
    base = `/t/${token}/${expires}/${libraryId}/${videoId}`;
  }

  const page = renderPlayer({
    title: vid.title || "Video",
    hls: `${base}/playlist.m3u8`,
    poster: vid.poster ? `/${libraryId}/${videoId}/thumbnail.jpg` : "",
    resumeKey: `dhara:${videoId}`,
    autoplay: url.searchParams.get("autoplay") === "1",
    start: Number(url.searchParams.get("t")) || 0,
  });
  return html(page, 200, headers);
}

// ---------- playlists, segments, thumbnails ----------

async function asset(request, env, ctx, url, libraryId, videoId, file, signed) {
  const { lib, vid, error } = await loadConfig(env, libraryId, videoId);
  if (error) return text(error === 403 ? "Forbidden" : "Not found", error);

  const isThumb = file === "thumbnail.jpg";
  // Thumbnails stay public so dashboards and course pages can show posters.
  if (!isThumb && needsToken(lib, vid)) {
    if (!signed || !(await verifyToken(lib.key, libraryId, videoId, signed.token, signed.expires))) {
      return text("Invalid or expired token", 403);
    }
  }
  if (!isAllowed(request, env, lib)) return text("Domain not allowed", 403);

  const key = `${libraryId}/${videoId}/${file}`;
  // Cache key never includes the token: every viewer shares one cached copy.
  const version = isThumb ? `?v=${url.searchParams.get("v") || ""}` : "";
  const cacheKey = new Request(`https://cache.dhara.internal/${key}${version}`);
  const cache = caches.default;

  let response = await cache.match(cacheKey);
  let hit = Boolean(response);
  if (!response) {
    const object = await env.BUCKET.get(key);
    if (!object) return text("Not found", 404);
    const headers = new Headers();
    headers.set("Content-Type", object.httpMetadata?.contentType || contentType(file));
    headers.set("Cache-Control", cacheControl(file));
    headers.set("Content-Length", String(object.size));
    headers.set("ETag", object.httpEtag);
    response = new Response(object.body, { headers });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  const out = new Response(request.method === "HEAD" ? null : response.body, response);
  out.headers.set("X-Dhara-Cache", hit ? "HIT" : "MISS");
  applyCors(request, env, lib, out.headers);

  const bytes = Number(out.headers.get("Content-Length") || 0);
  if (request.method === "GET") ctx.waitUntil(meter(request, env, vid, libraryId, videoId, bytes, hit));
  return out;
}

function contentType(file) {
  return CONTENT_TYPES[file.split(".").pop()] || "application/octet-stream";
}

function cacheControl(file) {
  if (file.endsWith(".m4s") || file.endsWith(".mp4")) return "public, max-age=31536000, immutable";
  if (file.endsWith(".m3u8")) return "public, max-age=3600";
  return "public, max-age=300";
}

// ---------- CORS ----------

function allowedOrigin(request, env, lib) {
  const who = requester(request);
  if (!who || !who.origin) return null;
  if (trustedHosts(request, env).includes(who.host)) return who.origin;
  const domains = lib.domains || [];
  if (domains.length === 0 || domains.some((p) => hostMatches(who.host, p))) return who.origin;
  return null;
}

function applyCors(request, env, lib, headers) {
  const origin = allowedOrigin(request, env, lib);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", "Content-Length, X-Dhara-Cache");
  }
  headers.append("Vary", "Origin");
}

async function preflight(request, env, url) {
  const m = url.pathname.match(RE_PRIVATE) || url.pathname.match(RE_PUBLIC);
  if (!m) return new Response(null, { status: 204 });
  const libraryId = url.pathname.startsWith("/t/") ? m[3] : m[1];
  const lib = await env.CONFIG.get(`lib:${libraryId}`, { type: "json" });
  const headers = new Headers({ "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Max-Age": "86400" });
  if (lib) applyCors(request, env, lib, headers);
  headers.set("Access-Control-Allow-Headers", request.headers.get("Access-Control-Request-Headers") || "Range");
  return new Response(null, { status: 204, headers });
}

// ---------- usage metering ----------

async function meter(request, env, vid, libraryId, videoId, bytes, hit) {
  const country = request.cf?.country || "XX";
  if (env.USAGE) {
    env.USAGE.writeDataPoint({
      indexes: [String(vid.org)],
      blobs: [String(vid.org), String(libraryId), videoId, hit ? "HIT" : "MISS", country],
      doubles: [bytes, 1, hit ? 1 : 0],
    });
  }
  if (env.USAGE_INGEST_URL && env.USAGE_INGEST_SECRET) {
    // Local development: Analytics Engine isn't available offline, so report to Django directly.
    const day = new Date().toISOString().slice(0, 10);
    await fetch(env.USAGE_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": env.USAGE_INGEST_SECRET },
      body: JSON.stringify({ points: [{ org: vid.org, lib: libraryId, vid: videoId, day, bytes, requests: 1, hits: hit ? 1 : 0 }] }),
    }).catch((e) => console.error("usage ingest failed", e));
  }
}

// ---------- internal API ----------

async function internal(request, env, url) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.INTERNAL_SECRET || !timingSafeEqual(auth, `Bearer ${env.INTERNAL_SECRET}`)) return text("Unauthorized", 401);

  const path = decodeURIComponent(url.pathname.slice("/__internal/".length));
  const [kind, ...rest] = path.split("/");
  const key = rest.join("/");

  if (kind === "kv" && /^(lib|vid):[\w-]+$/.test(key)) {
    if (request.method === "PUT") {
      await env.CONFIG.put(key, JSON.stringify(await request.json()));
      return json({ ok: true });
    }
    if (request.method === "DELETE") {
      await env.CONFIG.delete(key);
      return json({ ok: true });
    }
    if (request.method === "GET") return json(await env.CONFIG.get(key, { type: "json" }));
  }

  if (kind === "r2" && /^\d+\/[0-9a-f-]{36}\/[\w./-]+$/.test(key) && !key.includes("..")) {
    if (request.method === "PUT") {
      const cc = request.headers.get("X-Cache-Control") || cacheControl(key);
      const obj = await env.BUCKET.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get("Content-Type") || contentType(key), cacheControl: cc },
      });
      return json({ ok: true, size: obj.size });
    }
  }

  if (kind === "r2-prefix" && request.method === "DELETE" && /^\d+\/[0-9a-f-]{36}\/$/.test(key)) {
    let deleted = 0;
    let cursor;
    do {
      const list = await env.BUCKET.list({ prefix: key, cursor, limit: 1000 });
      const keys = list.objects.map((o) => o.key);
      if (keys.length) await env.BUCKET.delete(keys);
      deleted += keys.length;
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
    return json({ ok: true, deleted });
  }

  return text("Not found", 404);
}

// ---------- helpers ----------

function text(body, status) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function html(body, status, headers = {}) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...headers } });
}
