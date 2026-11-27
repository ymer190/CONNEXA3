import assert from "node:assert/strict";
import test from "node:test";
import { buildFirstAccessInviteUrl } from "./employee-invite-link-core.ts";

const supabaseUrl = "https://project.supabase.co";
const appUrl = "https://connexa.example.com";
const token = "a".repeat(64);

test("converts the Auth action link to the #93 browser-fragment contract", () => {
  const result = buildFirstAccessInviteUrl({
    actionLink: `${supabaseUrl}/auth/v1/verify?token=${token}&type=invite&redirect_to=https%3A%2F%2Fconnexa.example.com`,
    supabaseUrl,
    appUrl,
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  const url = new URL(result.url);
  assert.equal(url.origin, appUrl);
  assert.equal(url.pathname, "/confirmar-convite");
  assert.equal(url.search, "");
  assert.equal(url.hash, `#token_hash=${token}&type=invite`);
});

test("rejects action links from an unexpected host or verification type", () => {
  assert.deepEqual(
    buildFirstAccessInviteUrl({
      actionLink: `https://attacker.example/auth/v1/verify?token=${token}&type=invite`,
      supabaseUrl,
      appUrl,
    }),
    { success: false, code: "INVALID_AUTH_ACTION_LINK" },
  );
  assert.deepEqual(
    buildFirstAccessInviteUrl({
      actionLink: `${supabaseUrl}/auth/v1/verify?token=${token}&type=recovery`,
      supabaseUrl,
      appUrl,
    }),
    { success: false, code: "INVALID_AUTH_ACTION_LINK" },
  );
});

test("rejects non-HTTPS app URLs", () => {
  assert.deepEqual(
    buildFirstAccessInviteUrl({
      actionLink: `${supabaseUrl}/auth/v1/verify?token=${token}&type=invite`,
      supabaseUrl,
      appUrl: "http://connexa.example.com",
    }),
    { success: false, code: "INVALID_APP_URL" },
  );
});
