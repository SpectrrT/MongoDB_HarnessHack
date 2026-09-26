import test from "node:test";
import assert from "node:assert/strict";
import { isLocalRequest, remAdminGuard } from "../server/rem-guard.js";

const req = (remoteAddress, headers = {}) => ({
  socket: { remoteAddress },
  get: (name) => headers[name.toLowerCase()],
});

function run(guard, r) {
  let status = 200,
    body = null,
    passed = false;
  const res = { status: (s) => ((status = s), res), json: (b) => ((body = b), res) };
  guard(r, res, () => (passed = true));
  return { passed, status, body };
}

test("loopback requests, including through a local proxy, count as local", () => {
  assert.equal(isLocalRequest(req("127.0.0.1")), true);
  assert.equal(isLocalRequest(req("::1")), true);
  assert.equal(isLocalRequest(req("::ffff:127.0.0.1", { "x-forwarded-for": "127.0.0.1" })), true);
});

test("a remote peer, or a remote hop forwarded through a local proxy, is not local", () => {
  assert.equal(isLocalRequest(req("203.0.113.9")), false);
  assert.equal(isLocalRequest(req("127.0.0.1", { "x-forwarded-for": "203.0.113.9" })), false);
  assert.equal(isLocalRequest(req("127.0.0.1", { "x-forwarded-for": "127.0.0.1, 203.0.113.9" })), false);
  assert.equal(isLocalRequest(req(undefined)), false);
});

test("the guard passes local requests without a token", () => {
  assert.equal(run(remAdminGuard({ token: () => undefined }), req("127.0.0.1")).passed, true);
});

test("remote requests are refused when no admin token is configured", () => {
  const out = run(remAdminGuard({ token: () => undefined }), req("203.0.113.9", { "x-rem-admin-token": "anything" }));
  assert.equal(out.passed, false);
  assert.equal(out.status, 403);
  assert.match(out.body.error, /REM_ADMIN_TOKEN/);
});

test("remote requests need the exact admin token", () => {
  const guard = remAdminGuard({ token: () => "s3cret" });
  assert.equal(run(guard, req("203.0.113.9", { "x-rem-admin-token": "s3cret" })).passed, true);
  assert.equal(run(guard, req("203.0.113.9", { "x-rem-admin-token": "s3cre" })).status, 403);
  assert.equal(run(guard, req("203.0.113.9")).status, 403);
});
