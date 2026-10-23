import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { signToken, verifyToken } from "../src/token.js";
import { hostMatches, isAllowed, frameAncestors } from "../src/domains.js";

test("token matches the Python reference implementation", async () => {
  const expected = createHmac("sha256", "secret").update("12/abc/1700000000").digest("base64url");
  assert.equal(await signToken("secret", 12, "abc", 1700000000), expected);
});

test("verifyToken rejects expired, tampered and malformed tokens", async () => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const tok = await signToken("k", 1, "v", exp);
  assert.equal(await verifyToken("k", 1, "v", tok, exp), true);
  assert.equal(await verifyToken("k", 1, "other", tok, exp), false);
  assert.equal(await verifyToken("wrong", 1, "v", tok, exp), false);
  assert.equal(await verifyToken("k", 1, "v", tok, exp - 1200), false);
  assert.equal(await verifyToken("k", 1, "v", tok, "abc"), false);
  const old = Math.floor(Date.now() / 1000) - 1;
  assert.equal(await verifyToken("k", 1, "v", await signToken("k", 1, "v", old), old), false);
});

test("wildcards match subdomains and the apex only", () => {
  assert.equal(hostMatches("a.school.com", "*.school.com"), true);
  assert.equal(hostMatches("school.com", "*.school.com"), true);
  assert.equal(hostMatches("evilschool.com", "*.school.com"), false);
  assert.equal(hostMatches("school.com.evil.io", "school.com"), false);
});

const req = (headers) => new Request("https://vid.dhara.test/1/x/playlist.m3u8", { headers });
const env = { DASHBOARD_ORIGIN: "https://app.dhara.test" };

test("referer whitelist", () => {
  const lib = { domains: ["school.com"], direct: false };
  assert.equal(isAllowed(req({ Referer: "https://school.com/course" }), env, lib), true);
  assert.equal(isAllowed(req({ Origin: "https://pirate.com" }), env, lib), false);
  assert.equal(isAllowed(req({ Referer: "https://vid.dhara.test/embed/1/x" }), env, lib), true);
  assert.equal(isAllowed(req({ Origin: "https://app.dhara.test" }), env, lib), true);
  assert.equal(isAllowed(req({}), env, lib), false);
  assert.equal(isAllowed(req({}), env, { ...lib, direct: true }), true);
  assert.equal(isAllowed(req({ Origin: "https://anything.com" }), env, { domains: [], direct: false }), true);
});

test("frame-ancestors lists allowed domains", () => {
  assert.equal(frameAncestors(env, { domains: [] }), "*");
  const v = frameAncestors(env, { domains: ["school.com"] });
  assert.match(v, /https:\/\/school\.com/);
  assert.match(v, /https:\/\/app\.dhara\.test/);
});
