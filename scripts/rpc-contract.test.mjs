import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildDeviceSessionAdminArgs,
  buildListDeviceSessionsArgs,
  buildRegisterDeviceSessionArgs,
} from "../src/lib/device-session-rpc.mjs";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

function latestRpcParameters(rpcName) {
  const definition = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${rpcName}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
    "gi",
  );
  let parameters = null;

  for (const filename of migrationFiles) {
    const sql = readFileSync(join(migrationDirectory, filename), "utf8");
    for (const match of sql.matchAll(definition)) {
      parameters = match[1].trim()
        ? match[1].split(",").map((parameter) => parameter.trim().split(/\s+/)[0])
        : [];
    }
  }
  assert.notEqual(parameters, null, `No migration definition found for ${rpcName}`);
  return parameters;
}

function assertRpcArgsMatch(rpcName, args) {
  assert.deepEqual(Object.keys(args).sort(), latestRpcParameters(rpcName).sort(), `${rpcName} payload differs from the latest local migration signature`);
}

test("device enrollment payload matches the latest register_device_session signature", () => {
  assertRpcArgsMatch("register_device_session", buildRegisterDeviceSessionArgs({
    deviceId: "00000000-0000-4000-8000-000000000001",
    deviceSecret: "x".repeat(43),
    label: "Navegador",
    userAgent: "SQA browser",
  }));
});

test("device/session administration payloads match the #153 RPC signatures", () => {
  assertRpcArgsMatch("admin_list_device_sessions", buildListDeviceSessionsArgs({
    userId: null,
    justification: "revisão solicitada",
  }));
  assertRpcArgsMatch("admin_approve_device", buildDeviceSessionAdminArgs("admin_approve_device", {
    target: "00000000-0000-4000-8000-000000000001",
    ticketReference: "SUP-106",
    justification: "Validação do chamado",
  }));
  assertRpcArgsMatch("admin_revoke_device", buildDeviceSessionAdminArgs("admin_revoke_device", {
    target: "00000000-0000-4000-8000-000000000001",
    justification: "Solicitação de segurança",
  }));
  assertRpcArgsMatch("admin_revoke_session", buildDeviceSessionAdminArgs("admin_revoke_session", {
    target: "00000000-0000-4000-8000-000000000002",
    justification: "Sessão desconhecida",
  }));
});

test("administrative audit cursor migration declares a compound keyset cursor", () => {
  assert.deepEqual(latestRpcParameters("admin_list_administrative_audit"), [
    "p_before",
    "p_before_id",
    "p_limit",
  ]);
});
