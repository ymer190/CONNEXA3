const { createApprovedDeviceFixture } = require("./issue97-isolated-device-fixture.cjs");

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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

    const wrongSecretRegistration = await callRpc("register_device_session", {
      p_device_id: adminDeviceFixture.id,
      p_device_secret: "invalid-device-secret-for-sqa-regression-test",
      p_label: "Issue 97 isolated SQA fixture",
      p_user_agent: "GitHub Actions isolated SQA test",
    }, adminToken);
    if (wrongSecretRegistration.status !== 403 || wrongSecretRegistration.body?.code !== "42501") {
      throw new Error(`An existing session accepted the wrong device secret (HTTP ${wrongSecretRegistration.status}, code ${wrongSecretRegistration.body?.code ?? "none"}).`);
    }
    console.log("PASS: existing session rejects the correct device ID paired with an incorrect secret.");

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
