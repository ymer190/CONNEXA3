import assert from "node:assert/strict";
import test from "node:test";
import { classifyAuthFailure, getSafeRedirectDestination, isSameOriginRequest } from "../src/lib/auth-flow.mjs";

test("safe redirects preserve a same-origin route and its query", () => {
  assert.equal(getSafeRedirectDestination("/admin/dispositivos?tab=pending#list"), "/admin/dispositivos?tab=pending#list");
});

test("safe redirects reject external, protocol-relative, backslash, and control-character values", () => {
  for (const value of ["https://attacker.example", "//attacker.example", "/\\attacker.example", "/admin\nLocation: https://attacker.example"]) {
    assert.equal(getSafeRedirectDestination(value), "/", value);
  }
});

test("missing session is distinct from an expired token", () => {
  assert.equal(classifyAuthFailure({ name: "AuthSessionMissingError" }), "missing");
  assert.equal(classifyAuthFailure({ status: 401 }), "expired");
  assert.equal(classifyAuthFailure(null), "none");
});

test("unknown auth errors fail closed as service unavailable, not as logout", () => {
  assert.equal(classifyAuthFailure(new TypeError("fetch failed")), "unavailable");
  assert.equal(classifyAuthFailure({ status: 503 }), "unavailable");
});

test("device enrollment accepts only same-origin browser requests", () => {
  assert.equal(isSameOriginRequest("https://connexa.example", "https://connexa.example/api/device-sessions/register"), true);
  assert.equal(isSameOriginRequest("https://connexa.example/extra", "https://connexa.example/api/device-sessions/register"), false);
  assert.equal(isSameOriginRequest("https://attacker.example", "https://connexa.example/api/device-sessions/register"), false);
  assert.equal(isSameOriginRequest(null, "https://connexa.example/api/device-sessions/register"), false);
});
