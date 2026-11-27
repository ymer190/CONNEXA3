const { createHash, randomBytes, randomUUID } = require("node:crypto");

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

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
// updating, transferring, or deactivating real DEV data.
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
  return body.access_token;
}


function decodeJwtClaims(token) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Supabase returned an invalid access token.");
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Supabase returned an unreadable access token.");
  }
}

async function serviceRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`CI device-session fixture request failed with HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response;
}

// Provision only a temporary approved device with the private fixture key,
// then register the current Auth session through the real user-facing RPC.
// This exercises the #97 device/session contract instead of inserting a
// device_sessions row directly. All tested RPCs still use the real user JWT.
async function provisionAuthorizedDeviceSession(token, label) {
  const claims = decodeJwtClaims(token);
  const userId = claims.sub;
  const sessionId = claims.session_id;
  if (!userId || !sessionId) {
    throw new Error("Authenticated fixture token is missing sub/session_id claims.");
  }

  const deviceId = randomUUID();
  const deviceSecret = randomBytes(32).toString("base64url");
  const deviceSecretHash = createHash("sha256")
    .update(deviceSecret)
    .digest("hex");
  let deviceCreated = false;

  try {
    await serviceRequest("authorized_devices", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: deviceId,
        user_id: userId,
        secret_hash: `\\x${deviceSecretHash}`,
        label: `CI security smoke: ${label}`,
        user_agent: "CONNEXA GitHub Actions security smoke",
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: userId,
      }),
    });
    deviceCreated = true;

    const registration = await callRpc("register_device_session", {
      p_device_id: deviceId,
      p_device_secret: deviceSecret,
      p_label: `CI security smoke: ${label}`,
      p_user_agent: "CONNEXA GitHub Actions security smoke",
    }, token);
    if (registration.status !== 200 || registration.body !== "approved") {
      throw new Error(
        `register_device_session did not approve the current Auth session for ${label} (HTTP ${registration.status}, result ${JSON.stringify(registration.body)}).`
      );
    }
  } catch (error) {
    if (deviceCreated) {
      await serviceRequest(`device_sessions?session_id=eq.${sessionId}`, { method: "DELETE" }).catch(() => {});
      await serviceRequest(`authorized_devices?id=eq.${deviceId}`, { method: "DELETE" }).catch(() => {});
    }
    throw error;
  }

  console.log(`PASS: ${label} registered its current Auth session through register_device_session on a pre-approved temporary device.`);
  return async () => {
    await serviceRequest(`device_sessions?session_id=eq.${sessionId}`, { method: "DELETE" });
    await serviceRequest(`authorized_devices?id=eq.${deviceId}`, { method: "DELETE" });
    console.log(`PASS: temporary device/session fixture removed for ${label}.`);
  };
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
  if (!baseUrl || !apiKey) throw new Error("Supabase URL and publishable key are required.");
  if (!serviceKey) {
    throw new Error("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is required to create and clean temporary approved device/session fixtures.");
  }

  const userToken = await signIn(required("AUTH_TEST_USER_EMAIL"), required("AUTH_TEST_USER_PASSWORD"), "Regular-user");
  const adminToken = await signIn(required("AUTH_TEST_ADMIN_EMAIL"), required("AUTH_TEST_ADMIN_PASSWORD"), "Platform-admin");
  const cleanups = [];

  try {
    cleanups.push(await provisionAuthorizedDeviceSession(userToken, "regular-user"));
    cleanups.push(await provisionAuthorizedDeviceSession(adminToken, "platform-admin"));

    // Verify both fixture identities through their own JWTs after registering
    // their sessions. This catches accidentally configuring an admin as the
    // regular-user test account (which would make the negative RPC test invalid).
    const adminClaims = decodeJwtClaims(adminToken);
    const userClaims = decodeJwtClaims(userToken);
    const readOwnRole = async (token, userId, label) => {
      const response = await fetch(
        `${baseUrl}/rest/v1/platform_users?select=role&user_id=eq.${encodeURIComponent(userId)}`,
        { headers: { apikey: apiKey, Authorization: `Bearer ${token}` } },
      );
      const rows = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(rows)) {
        throw new Error(`${label} role lookup failed with HTTP ${response.status} using its registered device session.`);
      }
      return rows;
    };

    const adminRoleRows = await readOwnRole(adminToken, adminClaims.sub, "Admin");
    if (!adminRoleRows.some((row) => row.role === "platform_admin")) {
      throw new Error("The authenticated CI administrator has no visible platform_admin row after registering its session on an approved device.");
    }
    console.log("PASS: CI administrator has its own platform_admin row through restrictive RLS.");

    const regularRoleRows = await readOwnRole(userToken, userClaims.sub, "Regular-user");
    if (regularRoleRows.some((row) => row.role === "platform_admin")) {
      throw new Error("AUTH_TEST_USER_EMAIL is configured with platform_admin role. Configure a non-admin DEV test account; do not change database roles to satisfy CI.");
    }
    console.log("PASS: regular-user CI identity is not a platform_admin.");

    for (const [name, payload] of rpcCases) {
      const anonymous = await callRpc(name, payload, null);
      if (anonymous.status !== 401) throw new Error(`${name}: expected anonymous HTTP 401, received HTTP ${anonymous.status}.`);
      console.log(`PASS: ${name} denies a request without a user JWT (HTTP 401).`);
    }

    for (const [name, payload] of rpcCases) {
      const regularUser = await callRpc(name, payload, userToken);
      if (!isPermissionDenied(regularUser)) {
        const bodySummary = Array.isArray(regularUser.body)
          ? `JSON array (${regularUser.body.length} rows)`
          : regularUser.body && typeof regularUser.body === "object"
            ? `JSON object (code=${regularUser.body.code ?? "none"}, message=${regularUser.body.message ?? "none"})`
            : `response type=${typeof regularUser.body}`;
        throw new Error(
          `${name}: regular-user request was not denied as platform_admin (HTTP ${regularUser.status}; ${bodySummary}).`
        );
      }
      console.log(`PASS: ${name} denies a regular authenticated user (HTTP ${regularUser.status}).`);
    }

    for (const [name, payload] of rpcCases) {
      const admin = await callRpc(name, payload, adminToken);
      assertAdminReachedRpc(name, admin);
    }

    console.log("PASS: all six department RPC role guards were exercised through real Auth JWTs with approved device sessions.");
    console.log("NOTE: mutation RPCs use nonexistent identifiers; temporary CI device/session fixtures are removed in the finally block.");
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}
main().catch((error) => {
  console.error("Department RPC PostgREST security test failed:", error.message);
  process.exit(1);
});
