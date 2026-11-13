import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "AUTH_TEST_USER_EMAIL",
  "AUTH_TEST_USER_PASSWORD",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const baseUrl = process.env.SUPABASE_URL.replace(/\/+$/, "");
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

const login = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: publishableKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: process.env.AUTH_TEST_USER_EMAIL,
    password: process.env.AUTH_TEST_USER_PASSWORD,
  }),
});

const loginPayload = await login.json();
assert.ok(login.ok && loginPayload.access_token && loginPayload.user?.id,
  `Test user login failed (HTTP ${login.status})`);
const accessToken = loginPayload.access_token;
const userId = loginPayload.user.id;
console.log("PASS: authenticated test user login");

const profilePath = `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,full_name&limit=1`;
let ownProfile = await request(profilePath, { token: accessToken });
assert.equal(ownProfile.status, 200, `Own profile SELECT failed: ${JSON.stringify(ownProfile.payload)}`);
assert.ok(
  Array.isArray(ownProfile.payload) && ownProfile.payload.length <= 1,
  "Expected at most one profile for the authenticated user",
);

if (ownProfile.payload.length === 0) {
  const createProfile = await request("/rest/v1/profiles", {
    method: "POST",
    token: accessToken,
    body: { id: userId, full_name: "Connexa ACL API smoke test" },
    prefer: "return=minimal",
  });
  assert.equal(
    createProfile.status,
    201,
    `Own profile INSERT failed: HTTP ${createProfile.status} ${JSON.stringify(createProfile.payload)}`,
  );
  console.log("PASS: authenticated user can INSERT their own profile");
  ownProfile = await request(profilePath, { token: accessToken });
  assert.equal(ownProfile.status, 200, `Own profile SELECT after INSERT failed: ${JSON.stringify(ownProfile.payload)}`);
}

assert.equal(ownProfile.payload?.length, 1, "RLS should expose exactly the authenticated user's profile");
console.log("PASS: authenticated user can SELECT their own profile");

const currentName = ownProfile.payload[0].full_name;
const updateProfile = await request(
  `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
  {
    method: "PATCH",
    token: accessToken,
    body: { full_name: currentName },
    prefer: "return=minimal",
  },
);
assert.equal(updateProfile.status, 204,
  `Own profile UPDATE should succeed without changing its value: HTTP ${updateProfile.status} ${JSON.stringify(updateProfile.payload)}`);
console.log("PASS: authenticated user can UPDATE their own profile without changing its value");

const anonRead = await request("/rest/v1/profiles?select=id&limit=1");
expectDenied(anonRead, "anon cannot read profiles");

const absentId = randomUUID();
for (const table of ["profiles", "organizations", "organization_members"]) {
  const deniedDelete = await request(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(absentId)}`,
    { method: "DELETE", token: accessToken, prefer: "return=minimal" },
  );
  expectDenied(deniedDelete, `authenticated cannot DELETE from ${table}`);
}

console.log("All Supabase ACL API smoke tests passed.");
