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

async function main() {
  if (!baseUrl || !apiKey) throw new Error("Supabase URL and publishable key are required.");
  const userToken = await signIn(required("AUTH_TEST_USER_EMAIL"), required("AUTH_TEST_USER_PASSWORD"), "Regular-user");
  const adminToken = await signIn(required("AUTH_TEST_ADMIN_EMAIL"), required("AUTH_TEST_ADMIN_PASSWORD"), "Platform-admin");

  for (const [name, payload] of rpcCases) {
    const anonymous = await callRpc(name, payload, null);
    if (anonymous.status < 400) throw new Error(`${name}: anonymous request unexpectedly succeeded.`);
    console.log(`PASS: ${name} denies a request without a user JWT (HTTP ${anonymous.status}).`);
  }

  for (const [name, payload] of rpcCases) {
    const regularUser = await callRpc(name, payload, userToken);
    if (!isPermissionDenied(regularUser)) {
      throw new Error(`${name}: regular-user request was not denied as platform_admin (HTTP ${regularUser.status}).`);
    }
    console.log(`PASS: ${name} denies a regular authenticated user (HTTP ${regularUser.status}).`);
  }

  const admin = await callRpc("admin_list_departments", rpcCases[0][1], adminToken);
  if (admin.status !== 200 || !Array.isArray(admin.body)) {
    throw new Error(`Platform-admin positive control failed (HTTP ${admin.status}).`);
  }
  console.log("PASS: platform_admin JWT can call the guarded RPC through PostgREST.");
  console.log("PASS: department RPC authorization was exercised through real Supabase Auth JWTs.");
}

main().catch((error) => {
  console.error("Department RPC PostgREST security test failed:", error.message);
  process.exit(1);
});
