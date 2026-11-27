const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const frontend = fs.readFileSync(
  path.join(root, "src/app/admin/dispositivos/actions.ts"),
  "utf8",
);
const initialMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261126005001_issue_97_device_session_audit.sql"),
  "utf8",
);
const enrollmentRoute = fs.readFileSync(
  path.join(root, "src/app/api/device-sessions/register/route.ts"),
  "utf8",
);
const loginForm = fs.readFileSync(
  path.join(root, "src/app/login/login-form.tsx"),
  "utf8",
);

test("device approval frontend matches the two-argument DEV RPC contract", () => {
  assert.ok(frontend.includes('supabase.rpc(action, args)'));
  assert.ok(
    frontend.includes("{ p_device_id: target, p_justification: justification }"),
    "approval must send only the two arguments exposed by connexa-dev",
  );
  assert.doesNotMatch(frontend, /p_ticket_reference|ticketReference/);
  assert.doesNotMatch(frontend, /ticket_reference/);
});

test("initial DEV migration exposes the incompatible two-argument function", () => {
  assert.match(
    initialMigration,
    /create or replace function public\.admin_approve_device\(p_device_id uuid, p_justification text\)/,
  );
});

test("advanced SQA migrations are excluded from the basic integration branch", () => {
  assert.equal(
    fs.existsSync(path.join(root, "supabase/migrations/20261126010200_issue_97_sqa_gates.sql")),
    false,
    "SQA-only signature changes must remain deferred",
  );
  assert.equal(
    fs.existsSync(path.join(root, "supabase/migrations/20261126010300_issue_97_revalidate_legacy_devices.sql")),
    false,
    "legacy device revalidation must remain deferred",
  );
});


test("device enrollment rejects cross-origin requests", () => {
  assert.match(enrollmentRoute, /request\.headers\.get\("origin"\)/);
  assert.match(enrollmentRoute, /origin !== request\.nextUrl\.origin/);
  assert.match(enrollmentRoute, /status: 403/);
});

test("revoked or invalid device credentials require a fresh login", () => {
  assert.match(enrollmentRoute, /DEVICE_REENROLLMENT_REQUIRED/);
  assert.match(enrollmentRoute, /status: 409/);
  assert.match(enrollmentRoute, /maxAge: 0/);
  assert.doesNotMatch(enrollmentRoute, /result = await register\(\)/);
  assert.match(loginForm, /enrollment\.status === 409/);
  assert.match(loginForm, /Entre novamente para cadastrá-lo como um novo dispositivo/);
});
