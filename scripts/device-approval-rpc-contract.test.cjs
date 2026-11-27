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
const gatedMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261126010200_issue_97_sqa_gates.sql"),
  "utf8",
);

test("device approval frontend matches the two-argument DEV RPC contract", () => {
  assert.ok(frontend.includes('supabase.rpc(action, args)'));
  assert.match(
    frontend,
    /p_device_id:\\s*target,\\s*p_justification:\\s*justification/s,
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

test("gated SQA migration replaces it with the required three-argument contract", () => {
  assert.match(gatedMigration, /drop function public\.admin_approve_device\(uuid, text\);/);
  assert.match(
    gatedMigration,
    /create function public\.admin_approve_device\(\s*p_device_id uuid,\s*p_justification text,\s*p_ticket_reference text\s*\)/,
  );
  assert.match(gatedMigration, /nullif\(btrim\(p_ticket_reference\), ''\) is null/);
  assert.match(gatedMigration, /t\.ticket_reference = btrim\(p_ticket_reference\)/);
  assert.match(gatedMigration, /grant execute on function public\.admin_approve_device\(uuid, text, text\) to authenticated/);
  assert.doesNotMatch(gatedMigration, /grant execute on function public\.admin_approve_device\(uuid, text\)\s+to authenticated/);
});
