// Domain whitelist helpers. Patterns are exact hosts ("school.com") or wildcards ("*.school.com").

export function hostMatches(host, pattern) {
  host = host.toLowerCase();
  pattern = pattern.toLowerCase();
  if (pattern.startsWith("*.")) {
    const base = pattern.slice(2);
    return host === base || host.endsWith("." + base);
  }
  return host === pattern;
}

export function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Who is asking? Prefer Origin, fall back to Referer.
 * Returns { host, origin } or null when the request carries neither (apps, curl, direct visits).
 */
export function requester(request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== "null") {
    const host = hostOf(origin);
    if (host) return { host, origin };
  }
  const referer = request.headers.get("Referer");
  if (referer) {
    const host = hostOf(referer);
    if (host) return { host, origin: null };
  }
  return null;
}

/** Hosts that are always allowed: the edge itself (embed player) and the dashboard. */
export function trustedHosts(request, env) {
  const hosts = [new URL(request.url).host.toLowerCase()];
  const dash = hostOf(env.DASHBOARD_ORIGIN || "");
  if (dash) hosts.push(dash);
  return hosts;
}

export function isAllowed(request, env, lib) {
  const who = requester(request);
  if (!who) return Boolean(lib.direct);
  if (trustedHosts(request, env).includes(who.host)) return true;
  const domains = lib.domains || [];
  if (domains.length === 0) return true;
  return domains.some((p) => hostMatches(who.host, p));
}

/** CSP frame-ancestors value for the embed page. */
export function frameAncestors(env, lib) {
  const domains = lib.domains || [];
  if (domains.length === 0) return "*";
  const sources = ["'self'"];
  if (env.DASHBOARD_ORIGIN) sources.push(env.DASHBOARD_ORIGIN);
  for (const d of domains) sources.push(`https://${d}`, `http://${d}`);
  return sources.join(" ");
}
