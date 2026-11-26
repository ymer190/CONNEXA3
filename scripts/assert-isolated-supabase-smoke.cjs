const { spawnSync } = require("node:child_process");
const path = require("node:path");

const guard = path.join(__dirname, "assert-isolated-supabase.cjs");
const ref = "0123456789abcdefghij";

function runCase(name, env, expectedSuccess) {
  const result = spawnSync(process.execPath, [guard], { env: { ...env }, encoding: "utf8" });
  const passed = expectedSuccess ? result.status === 0 : result.status !== 0;
  if (!passed) {
    throw new Error(`${name}: expected ${expectedSuccess ? "success" : "rejection"}; exit=${result.status}; output=${result.stderr || result.stdout}`);
  }
  console.log(`PASS: ${name}`);
}

const base = {
  PATH: process.env.PATH,
  AUTH_TEST_SUPABASE_PROJECT_REF: ref,
  AUTH_TEST_SUPABASE_URL: `https://${ref}.supabase.co`,
  AUTH_TEST_SUPABASE_DB_URL: `postgresql://postgres:${encodeURIComponent("test-password")}@db.${ref}.supabase.co:5432/postgres`,
};

runCase("explicit SQA API and DB allowlist succeeds", base, true);
runCase("regional Supabase pooler with matching project username succeeds", {
  ...base,
  AUTH_TEST_SUPABASE_DB_URL: `postgresql://postgres.${ref}:test-password@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
}, true);
runCase("missing allowlist fails closed", { ...base, AUTH_TEST_SUPABASE_PROJECT_REF: "" }, false);
runCase("missing API URL fails closed without NEXT_PUBLIC fallback", { ...base, AUTH_TEST_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_URL: base.AUTH_TEST_SUPABASE_URL }, false);
runCase("missing DB URL fails closed", { ...base, AUTH_TEST_SUPABASE_DB_URL: "" }, false);
runCase("connexa-dev is rejected", {
  ...base,
  AUTH_TEST_SUPABASE_PROJECT_REF: "dzsacdtolxrqgwlekzdg",
  AUTH_TEST_SUPABASE_URL: "https://dzsacdtolxrqgwlekzdg.supabase.co",
  AUTH_TEST_SUPABASE_DB_URL: "postgresql://postgres:pw@db.dzsacdtolxrqgwlekzdg.supabase.co:5432/postgres",
}, false);
runCase("connexa production is rejected", {
  ...base,
  AUTH_TEST_SUPABASE_PROJECT_REF: "uwrzrwwzkurjdhxituwq",
  AUTH_TEST_SUPABASE_URL: "https://uwrzrwwzkurjdhxituwq.supabase.co",
  AUTH_TEST_SUPABASE_DB_URL: "postgresql://postgres:pw@db.uwrzrwwzkurjdhxituwq.supabase.co:5432/postgres",
}, false);
runCase("API mismatch with SQA allowlist is rejected", { ...base, AUTH_TEST_SUPABASE_URL: "https://uwrzrwwzkurjdhxituwq.supabase.co" }, false);
runCase("database mismatch with SQA allowlist is rejected", {
  ...base,
  AUTH_TEST_SUPABASE_DB_URL: "postgresql://postgres:pw@db.uwrzrwwzkurjdhxituwq.supabase.co:5432/postgres",
}, false);
runCase("unrelated database host is rejected", {
  ...base,
  AUTH_TEST_SUPABASE_DB_URL: `postgresql://postgres:${encodeURIComponent("test-password")}@db.example.invalid:5432/postgres`,
}, false);
runCase("non-Supabase API host is rejected", { ...base, AUTH_TEST_SUPABASE_URL: "https://example.invalid" }, false);

