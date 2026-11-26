const { createApprovedDeviceFixture } = require("./issue97-isolated-device-fixture.cjs");

const baseUrl = process.env.AUTH_TEST_SUPABASE_URL?.replace(/\/$/, "");
const apiKey = process.env.AUTH_TEST_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.AUTH_TEST_SUPABASE_SERVICE_ROLE_KEY;

const rpcCases = [
  ["admin_list_departments", { p_organization_id: "00000000-0000-0000-0000-000000000000" }],
  ["admin_create_department", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_name: "RPC security smoke test" }],
  ["admin_update_department", { p_department_id: "00000000-0000-0000-0000-000000000000", p_organization_id: "00000000-0000-0000-0000-000000000000", p_name: "RPC security smoke test" }],
  ["admin_deactivate_department", { p_department_id: "00000000-0000-0000-0000-000000000000", p_organization_id: "00000000-0000-0000-0000-000000000000" }],
  ["admin_list_department_members", { p_department_id: "00000000-0000-0000-0000-000000000000", p_organization_id: "00000000-0000-0000-0000-000000000000" }],
  ["admin_transfer_department_member", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_user_id: "00000000-0000-0000-0000-000000000000", p_new_department_id: "00000000-0000-0000-0000-000000000000" }],
];

// These deliberately nonexistent IDs make the admin calls non-mutating.
// Expected domain errors prove the request passed the role guard without creating,
// updating, transferring, or deactivating real application data.
const adminDomainOutcomes = {
  admin_list_departments: { status: 200, predicate: (result) => Array.isArray(result.body) && result.body.length === 0 },
  admin_create_department: { code: "23503" }, // FK: organization does not exist
  admin_update_department: { code: "P0002" }, // active department does not exist
  admin_deactivate_department: { code: "P0002" }, // active department does not exist
  admin_list_department_members: { status: 200, predicate: (result) => Array.isArray(result.body) && result.body.length === 0 },
  admin_transfer_department_member: { code: "23514" }, // active destination department does not exist
};

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function signIn(email, password, label) {
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`${label} sign-in failed with HTTP ${response.status}.`);
  }
  return { accessToken: body.access_token, userId: body.user?.id };
}

async function callRpc(name, payload, token) {
  const headers = { apikey: apiKey, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}

async function readFixtureRows(table, filters, select) {
  const query = new URLSearchParams({ ...filters, select });
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Could not inspect isolated ${table} fixture (HTTP ${response.status}).`);
  return response.json();
}

async function updateFixtureRow(table, filters, values) {
  const query = new URLSearchParams(filters);
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(values),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Could not prepare isolated ${table} revocation fixture (HTTP ${response.status}).`);
}

async function readDeviceSessionSnapshot(deviceId, sessionId) {
  const [devices, sessions] = await Promise.all([
    readFixtureRows("authorized_devices", { id: `eq.${deviceId}` }, "id,user_id,status,secret_hash,last_seen_at,revoked_at"),
    readFixtureRows("device_sessions", { session_id: `eq.${sessionId}` }, "session_id,user_id,device_id,status,last_seen_at,revoked_at"),
  ]);
  if (devices.length !== 1 || sessions.length !== 1) {
    throw new Error(`Expected exactly one device and one session fixture; found ${devices.length} and ${sessions.length}.`);
  }
  return { device: devices[0], session: sessions[0] };
}

async function assertAuthorizationFalse(token, label) {
  const result = await callRpc("device_session_is_authorized", {}, token);
  if (result.status !== 200 || result.body !== false) {
    throw new Error(`${label}: expected protected-device authorization false; received HTTP ${result.status}, body ${JSON.stringify(result.body)}.`);
  }
}

async function assertRejectedWithoutWrites({ label, token, payload, fixture, sessionId }) {
  const before = await readDeviceSessionSnapshot(fixture.id, sessionId);
  const result = await callRpc("register_device_session", payload, token);
  if (result.status !== 403 || result.body?.code !== "42501") {
    throw new Error(`${label}: expected HTTP 403/SQLSTATE 42501; received HTTP ${result.status}, code ${result.body?.code ?? "none"}.`);
  }
  const after = await readDeviceSessionSnapshot(fixture.id, sessionId);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(`${label}: rejected call changed device/session fields, including last_seen_at.`);
  }
  console.log(`PASS: ${label} is rejected without modifying device/session records or last_seen_at.`);
}

function isPermissionDenied(result) {
  const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {});
  return (result.status === 401 || result.status === 403) &&
    (result.status === 401 || detail.includes("42501") || detail.includes("Platform administrator role required"));
}

function assertAdminReachedRpc(name, result) {
  const expected = adminDomainOutcomes[name];
  if (expected.status !== undefined) {
    if (result.status !== expected.status || !expected.predicate(result)) {
      throw new Error(`${name}: expected HTTP ${expected.status} with the non-mutating empty result; received HTTP ${result.status}.`);
    }
  } else if (result.status < 400 || result.body?.code !== expected.code) {
    throw new Error(`${name}: platform_admin did not reach the expected domain validation (expected ${expected.code}, received HTTP ${result.status}, code ${result.body?.code ?? "none"}).`);
  }
  console.log(`PASS: platform_admin JWT passed the role guard for ${name} (HTTP ${result.status}${expected.code ? `, domain code ${expected.code}` : ""}; no DEV data mutation).`);
}

async function main() {
  if (!baseUrl || !apiKey || !serviceRoleKey) throw new Error("Isolated Supabase URL, publishable key, and service-role key are required.");
  const userSession = await signIn(required("AUTH_TEST_USER_EMAIL"), required("AUTH_TEST_USER_PASSWORD"), "Regular-user");
  const adminSession = await signIn(required("AUTH_TEST_ADMIN_EMAIL"), required("AUTH_TEST_ADMIN_PASSWORD"), "Platform-admin");
  const userToken = userSession.accessToken;
  const adminToken = adminSession.accessToken;
  const jwtPayload = adminToken.split(".")[1];
  const adminClaims = jwtPayload ? JSON.parse(Buffer.from(jwtPayload, "base64url").toString("utf8")) : {};
  const sessionId = adminClaims.session_id;
  if (!sessionId || adminClaims.sub !== adminSession.userId) {
    throw new Error("The issued administrator JWT does not contain its matching user ID and session_id claims.");
  }
  const adminDeviceFixture = await createApprovedDeviceFixture({
    baseUrl,
    apiKey,
    serviceRoleKey,
    userId: adminSession.userId,
  });

  try {
    const registration = await callRpc("register_device_session", {
      p_device_id: adminDeviceFixture.id,
      p_device_secret: adminDeviceFixture.secret,
      p_label: "Issue 97 isolated SQA fixture",
      p_user_agent: "GitHub Actions isolated SQA test",
    }, adminToken);
    if (registration.status !== 200 || registration.body !== "approved") {
      throw new Error(`Unable to bind the approved isolated admin-device fixture (HTTP ${registration.status}).`);
    }
    console.log("PASS: isolated platform_admin session is bound to its approved device fixture.");

    const correctSecretRegistration = await callRpc("register_device_session", {
      p_device_id: adminDeviceFixture.id,
      p_device_secret: adminDeviceFixture.secret,
      p_label: "Issue 97 isolated SQA fixture",
      p_user_agent: "GitHub Actions isolated SQA test",
    }, adminToken);
    if (correctSecretRegistration.status !== 200 || correctSecretRegistration.body !== "approved") {
      throw new Error(`A linked session rejected its correct device secret (HTTP ${correctSecretRegistration.status}).`);
    }
    console.log("PASS: same user/session/device is accepted when the linked device secret is correct.");

    const linkedDevicePayload = {
      p_device_id: adminDeviceFixture.id,
      p_device_secret: "invalid-device-secret-for-sqa-regression-test",
      p_label: "Issue 97 isolated SQA fixture",
      p_user_agent: "GitHub Actions isolated SQA test",
    };
    await assertRejectedWithoutWrites({
      label: "linked device ID with incorrect secret",
      token: adminToken,
      payload: linkedDevicePayload,
      fixture: adminDeviceFixture,
      sessionId,
    });

    await updateFixtureRow("authorized_devices", { id: `eq.${adminDeviceFixture.id}` }, {
      status: "revoked", revoked_at: new Date().toISOString(), revoked_by: null,
    });
    await assertRejectedWithoutWrites({
      label: "revoked device with correct secret",
      token: adminToken,
      payload: { ...linkedDevicePayload, p_device_secret: adminDeviceFixture.secret },
      fixture: adminDeviceFixture,
      sessionId,
    });
    await assertAuthorizationFalse(adminToken, "revoked device");

    await updateFixtureRow("authorized_devices", { id: `eq.${adminDeviceFixture.id}` }, {
      status: "approved", revoked_at: null, revoked_by: null,
    });
    await updateFixtureRow("device_sessions", { session_id: `eq.${sessionId}` }, {
      status: "revoked", revoked_at: new Date().toISOString(), revoked_by: null,
    });
    await assertRejectedWithoutWrites({
      label: "revoked session with correct device secret",
      token: adminToken,
      payload: { ...linkedDevicePayload, p_device_secret: adminDeviceFixture.secret },
      fixture: adminDeviceFixture,
      sessionId,
    });
    await assertAuthorizationFalse(adminToken, "revoked session");

  for (const [name, payload] of rpcCases) {
    const anonymous = await callRpc(name, payload, null);
    if (anonymous.status !== 401) throw new Error(`${name}: expected anonymous HTTP 401, received HTTP ${anonymous.status}.`);
    console.log(`PASS: ${name} denies a request without a user JWT (HTTP 401).`);
  }

  for (const [name, payload] of rpcCases) {
    const regularUser = await callRpc(name, payload, userToken);
    if (!isPermissionDenied(regularUser)) {
      throw new Error(`${name}: regular-user request was not denied as platform_admin (HTTP ${regularUser.status}).`);
    }
    console.log(`PASS: ${name} denies a regular authenticated user (HTTP ${regularUser.status}).`);
  }

  const deviceAuthorization = await callRpc("device_session_is_authorized", {}, adminToken);
  if (deviceAuthorization.status !== 200 || typeof deviceAuthorization.body !== "boolean") {
    throw new Error(`Unable to verify administrator device authorization (HTTP ${deviceAuthorization.status}).`);
  }

  for (const [name, payload] of rpcCases) {
    const admin = await callRpc(name, payload, adminToken);
    if (deviceAuthorization.body !== true) {
      const detail = typeof admin.body === "string" ? admin.body : JSON.stringify(admin.body ?? {});
      if (admin.status !== 403 || !detail.includes("Authorized device required")) {
        throw new Error(`${name}: unapproved admin device was not denied by the device gate (HTTP ${admin.status}).`);
      }
      console.log(`PASS: ${name} denies a platform_admin with an unapproved device (HTTP ${admin.status}).`);
    } else {
      assertAdminReachedRpc(name, admin);
    }
  }

    console.log("PASS: all six department RPCs were exercised through real Supabase Auth JWTs and an approved device in the isolated SQA project.");
    console.log("NOTE: admin mutations use nonexistent identifiers; read RPCs may append test audit events in the isolated SQA project.");
  } finally {
    await adminDeviceFixture.cleanup();
  }
}

main().catch((error) => {
  console.error("Department RPC PostgREST security test failed:", error.message);
  process.exit(1);
});
