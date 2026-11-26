const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const rpcCases = [
  ["admin_list_departments", { p_organization_id: "00000000-0000-0000-0000-000000000000" }],
  ["admin_create_department", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_name: "RPC security smoke test" }],
  ["admin_update_department", { p_department_id: "00000000-0000-0000-0000-000000000000", p_organization_id: "00000000-0000-0000-0000-000000000000", p_name: "RPC security smoke test" }],
  ["admin_deactivate_department", { p_department_id: "00000000-0000-0000-0000-000000000000", p_organization_id: "00000000-0000-0000-0000-000000000000" }],
  ["admin_list_department_members", { p_department_id: "00000000-0000-0000-0000-000000000000", p_organization_id: "00000000-0000-0000-0000-000000000000" }],
  ["admin_transfer_department_member", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_user_id: "00000000-0000-0000-0000-000000000000", p_new_department_id: "00000000-0000-0000-0000-000000000000" }],
];

// Deliberately nonexistent IDs keep the department mutation checks non-mutating.
const adminDomainOutcomes = {
  admin_list_departments: { status: 200, predicate: (result) => Array.isArray(result.body) && result.body.length === 0 },
  admin_create_department: { code: "23503" },
  admin_update_department: { code: "P0002" },
  admin_deactivate_department: { code: "P0002" },
  admin_list_department_members: { status: 200, predicate: (result) => Array.isArray(result.body) && result.body.length === 0 },
  admin_transfer_department_member: { code: "23514" },
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
  if (!response.ok || !body.access_token || !body.user?.id) {
    throw new Error(`${label} sign-in failed with HTTP ${response.status}.`);
  }
  return { token: body.access_token, userId: body.user.id };
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

async function registerApprovedSession(label, auth, deviceId, deviceSecret) {
  const result = await callRpc("register_device_session", {
    p_device_id: deviceId,
    p_device_secret: deviceSecret,
    p_label: `GitHub Actions ${label}`,
    p_user_agent: "CONNEXA3 GitHub Actions CI",
  }, auth.token);

  if (result.status !== 200 || result.body !== "approved") {
    const code = result.body?.code ?? "unknown";
    throw new Error(
      `${label} device/session is not approved (HTTP ${result.status}, code ${code}). ` +
      "Enroll this CI device through the normal flow and approve it with a separate authorized administrator."
    );
  }
  console.log(`PASS: ${label} CI device and current Auth session are approved.`);
}

function isPermissionDenied(result) {
  const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {});
  return result.status === 403 &&
    (detail.includes("42501") || detail.includes("Platform administrator role required"));
}

function assertAdminReachedRpc(name, result) {
  const expected = adminDomainOutcomes[name];
  if (expected.status !== undefined) {
    if (result.status !== expected.status || !expected.predicate(result)) {
      throw new Error(`${name}: expected HTTP ${expected.status} with the non-mutating empty result; received HTTP ${result.status}.`);
    }
  } else if (result.status < 400 || result.body?.code !== expected.code) {
    throw new Error(`${name}: platform_admin did not reach expected domain validation (expected ${expected.code}, received HTTP ${result.status}, code ${result.body?.code ?? "none"}).`);
  }
  console.log(`PASS: platform_admin reached the domain guard for ${name} (HTTP ${result.status}${expected.code ? `, code ${expected.code}` : ""}; no department data mutation).`);
}

async function validateRealAuditAndCursor(admin) {
  const payload = {
    p_user_id: admin.userId,
    p_justification: "GitHub Actions CI: validate authenticated administrative audit pagination",
  };

  // These are real, read-only administrative operations. Their normal server-side
  // audit hooks create the real events consumed by the pagination test below.
  for (let i = 0; i < 2; i += 1) {
    const result = await callRpc("admin_list_device_sessions", payload, admin.token);
    if (result.status !== 200 || !Array.isArray(result.body)) {
      throw new Error(`admin_list_device_sessions audit fixture failed (HTTP ${result.status}, code ${result.body?.code ?? "unknown"}).`);
    }
  }

  const firstPage = await callRpc("admin_list_administrative_audit", {
    p_before: null,
    p_before_id: null,
    p_limit: 100,
  }, admin.token);

  if (firstPage.status !== 200 || !Array.isArray(firstPage.body)) {
    throw new Error(`Administrative audit first page failed (HTTP ${firstPage.status}, code ${firstPage.body?.code ?? "unknown"}).`);
  }

  const ownEvents = firstPage.body.filter((event) =>
    event.actor_user_id === admin.userId &&
    event.action === "device_sessions.list" &&
    event.target_id === admin.userId &&
    event.outcome === "allowed"
  );

  if (ownEvents.length < 2) {
    throw new Error("Administrative audit did not return the two real CI-triggered events.");
  }

  const cursor = ownEvents[0];
  const expectedNext = ownEvents[1];
  const nextPage = await callRpc("admin_list_administrative_audit", {
    p_before: cursor.occurred_at,
    p_before_id: cursor.id,
    p_limit: 100,
  }, admin.token);

  if (nextPage.status !== 200 || !Array.isArray(nextPage.body)) {
    throw new Error(`Administrative audit cursor page failed (HTTP ${nextPage.status}, code ${nextPage.body?.code ?? "unknown"}).`);
  }

  const expectedId = String(expectedNext.id);
  if (!nextPage.body.some((event) => String(event.id) === expectedId)) {
    throw new Error("Composite audit cursor did not return the next real event without omission.");
  }

  console.log("PASS: PostgREST returned real administrative audit events and the composite (occurred_at, id) cursor returned the next event.");
}

async function main() {
  if (!baseUrl || !apiKey) throw new Error("Supabase URL and publishable key are required.");

  const user = await signIn(required("AUTH_TEST_USER_EMAIL"), required("AUTH_TEST_USER_PASSWORD"), "Regular-user");
  const admin = await signIn(required("AUTH_TEST_ADMIN_EMAIL"), required("AUTH_TEST_ADMIN_PASSWORD"), "Platform-admin");

  await registerApprovedSession(
    "regular-user",
    user,
    required("AUTH_TEST_USER_DEVICE_ID"),
    required("AUTH_TEST_USER_DEVICE_SECRET")
  );
  await registerApprovedSession(
    "platform-admin",
    admin,
    required("AUTH_TEST_ADMIN_DEVICE_ID"),
    required("AUTH_TEST_ADMIN_DEVICE_SECRET")
  );

  for (const [name, payload] of rpcCases) {
    const anonymous = await callRpc(name, payload, null);
    if (anonymous.status !== 401) throw new Error(`${name}: expected anonymous HTTP 401, received HTTP ${anonymous.status}.`);
    console.log(`PASS: ${name} denies a request without a user JWT (HTTP 401).`);
  }

  for (const [name, payload] of rpcCases) {
    const regularUser = await callRpc(name, payload, user.token);
    if (!isPermissionDenied(regularUser)) {
      throw new Error(`${name}: authorized regular-user session was not denied by the platform-admin role guard (HTTP ${regularUser.status}).`);
    }
    console.log(`PASS: ${name} denies an authorized regular-user session (HTTP 403).`);
  }

  for (const [name, payload] of rpcCases) {
    const result = await callRpc(name, payload, admin.token);
    assertAdminReachedRpc(name, result);
  }

  await validateRealAuditAndCursor(admin);

  console.log("PASS: all six department RPCs were exercised with anonymous, regular-user, and authorized platform-admin sessions.");
  console.log("PASS: the audit pagination test used real audited administrative operations; it inserted no synthetic rows and performed no department mutations.");
}

main().catch((error) => {
  console.error("Department RPC/PostgREST security test failed:", error.message);
  process.exit(1);
});
