// Signed tokens: base64url(HMAC-SHA256(security_key, "{library_id}/{video_id}/{expires}")), no padding.

const encoder = new TextEncoder();

export function base64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signToken(key, libraryId, videoId, expires) {
  const k = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(`${libraryId}/${videoId}/${expires}`));
  return base64url(sig);
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyToken(key, libraryId, videoId, token, expires, now = Date.now() / 1000) {
  if (!token || !/^\d{1,12}$/.test(String(expires))) return false;
  if (Number(expires) < now) return false;
  const expected = await signToken(key, libraryId, videoId, expires);
  return timingSafeEqual(expected, token);
}
