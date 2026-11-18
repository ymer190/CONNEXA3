import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "AUTH_TEST_USER_EMAIL",
  "AUTH_TEST_USER_PASSWORD",
  "AUTH_TEST_USER_2_EMAIL",
  "AUTH_TEST_USER_2_PASSWORD",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const baseUrl = process.env.SUPABASE_URL.replace(/\\/+$/, "");
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

async function request(path, { method = "GET", token, body, prefer } = {}) {
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${token ?? publishableKey}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

function expectDenied(result, label) {
  assert.ok(
    result.status === 401 || result.status === 403,
    `${label}: expected HTTP 401/403, received ${result.status}: ${JSON.stringify(result.payload)}`,
  );
  console.log(`PASS: ${label} (HTTP ${result.status})`);
}

async function login(email, password, label) {
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  assert.ok(response.ok && payload.access_token && payload.user?.id,
    `${label} login failed (HTTP ${response.status})`);
  console.log(`PASS: ${label} login`);
  return { token: payload.access_token, userId: payload.user.id };
}

async function ensureOwnProfile(user, label) {
  const path = `/rest/v1/profiles?id=eq.${encodeURIComponent(user.userId)}&select=id,full_name&limit=1`;
  let result = await request(path, { token: user.token });
  assert.equal(result.status, 200, `${label} own profile SELECT failed: ${JSON.stringify(result.payload)}`);
  assert.ok(Array.isArray(result.payload) && result.payload.length <= 1);

  if (result.payload.length === 0) {
    const inserted = await request("/rest/v1/profiles", {
      method: "POST",
      token: user.token,
      body: { id: user.userId, full_name: `Connexa ACL API smoke test ${label}` },
      prefer: "return=minimal",
    });
    assert.equal(inserted.status, 201,
      `${label} own profile INSERT failed: HTTP ${inserted.status} ${JSON.stringify(inserted.payload)}`);
    console.log(`PASS: ${label} can INSERT own profile`);
    result = await request(path, { token: user.token });
    assert.equal(result.status, 200);
  } else {
    console.log(`INFO: ${label} profile already exists; own-profile INSERT scenario not exercised`);
  }

  assert.equal(result.payload.length, 1, `${label} should see exactly their own profile`);
  const update = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.userId)}`, {
    method: "PATCH",
    token: user.token,
    body: { full_name: result.payload[0].full_name },
    prefer: "return=minimal",
  });
  assert.equal(update.status, 204,
    `${label} own profile UPDATE failed: HTTP ${update.status} ${JSON.stringify(update.payload)}`);
  console.log(`PASS: ${label} can SELECT and UPDATE own profile`);
}

const userA = await login(process.env.AUTH_TEST_USER_EMAIL, process.env.AUTH_TEST_USER_PASSWORD, "user A");
const userB = await login(process.env.AUTH_TEST_USER_2_EMAIL, process.env.AUTH_TEST_USER_2_PASSWORD, "user B");
assert.notEqual(userA.userId, userB.userId, "The two test credentials must belong to different Auth users");

await ensureOwnProfile(userA, "user A");
await ensureOwnProfile(userB, "user B");

// A user's token must not expose another user's profile or membership.
for (const [label, caller, other] of [
  ["A cannot read B", userA, userB],
  ["B cannot read A", userB, userA],
]) {
  const profile = await request(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(other.userId)}&select=id&limit=1`,
    { token: caller.token },
  );
  assert.equal(profile.status, 200, `${label}: profile query failed with HTTP ${profile.status}`);
  assert.deepEqual(profile.payload, [], `${label}: another user's profile was visible`);
  console.log(`PASS: ${label} (empty result)`);

  const membership = await request(
    `/rest/v1/organization_members?user_id=eq.${encodeURIComponent(other.userId)}&select=user_id&limit=1`,
    { token: caller.token },
  );
  assert.equal(membership.status, 200, `${label}: membership query failed with HTTP ${membership.status}`);
  assert.deepEqual(membership.payload, [], `${label}: another user's membership was visible`);
  console.log(`PASS: ${label} membership (empty result)`);
}

const anonRead = await request("/rest/v1/profiles?select=id&limit=1");
expectDenied(anonRead, "anon cannot read profiles");

// INSERT policy must reject a profile whose id is not auth.uid().
const foreignInsert = await request("/rest/v1/profiles", {
  method: "POST",
  token: userA.token,
  body: { id: userB.userId, full_name: "Unauthorized cross-user insert" },
  prefer: "return=minimal",
});
expectDenied(foreignInsert, "user A cannot INSERT a profile for user B");

const absentId = randomUUID();
for (const table of ["profiles", "organizations", "organization_members"]) {
  const deniedDelete = await request(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(absentId)}`,
    { method: "DELETE", token: userA.token, prefer: "return=minimal" },
  );
  expectDenied(deniedDelete, `authenticated cannot DELETE from ${table}`);
}

console.log("All Supabase ACL API smoke tests passed.");
