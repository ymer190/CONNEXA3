const BLOCKED_PROJECT_REFS = new Set([
  "dzsacdtolxrqgwlekzdg", // connexa-dev
  "uwrzrwwzkurjdhxituwq", // connexa production
]);

function fail(message) {
  console.error(`Isolated Supabase guard failed: ${message}`);
  process.exit(1);
}

const allowedProjectRef = process.env.AUTH_TEST_SUPABASE_PROJECT_REF;
if (!allowedProjectRef || !/^[a-z0-9]{20}$/i.test(allowedProjectRef)) {
  fail("AUTH_TEST_SUPABASE_PROJECT_REF must be the explicit 20-character SQA allowlist ref.");
}
if (BLOCKED_PROJECT_REFS.has(allowedProjectRef)) {
  fail("the allowlisted ref cannot be connexa-dev or connexa production.");
}

const apiUrl = process.env.AUTH_TEST_SUPABASE_URL;
if (!apiUrl) fail("AUTH_TEST_SUPABASE_URL is required; there is no fallback URL.");

const databaseUrl = process.env.AUTH_TEST_SUPABASE_DB_URL;
if (!databaseUrl) fail("AUTH_TEST_SUPABASE_DB_URL is required to verify the migration target.");

let api;
try {
  api = new URL(apiUrl);
} catch {
  fail("AUTH_TEST_SUPABASE_URL must be a valid URL.");
}

if (api.protocol !== "https:" || api.username || api.password || api.port || api.pathname !== "/" || api.search || api.hash) {
  fail("AUTH_TEST_SUPABASE_URL must be the HTTPS project root without credentials, port, path, or query.");
}

const apiRef = /^([a-z0-9]{20})\.supabase\.co$/i.exec(api.hostname)?.[1]?.toLowerCase();
if (!apiRef) fail("AUTH_TEST_SUPABASE_URL must identify a Supabase project host.");
if (BLOCKED_PROJECT_REFS.has(apiRef)) fail("DEV and Production are forbidden test targets.");
if (apiRef !== allowedProjectRef.toLowerCase()) {
  fail("the API URL does not match the independently configured SQA allowlist ref.");
}

let database;
try {
  database = new URL(databaseUrl);
} catch {
  fail("AUTH_TEST_SUPABASE_DB_URL must be a valid PostgreSQL URL.");
}

if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.username || !database.password) {
  fail("AUTH_TEST_SUPABASE_DB_URL must be a PostgreSQL connection URL with credentials.");
}

const directRef = /^db\.([a-z0-9]{20})\.supabase\.co$/i.exec(database.hostname)?.[1]?.toLowerCase();
let databaseRef = directRef;
if (!directRef) {
  const username = decodeURIComponent(database.username);
  const poolerRef = /^postgres\.([a-z0-9]{20})$/i.exec(username)?.[1]?.toLowerCase();
  if (database.hostname.endsWith(".pooler.supabase.com") && poolerRef) databaseRef = poolerRef;
}

if (!databaseRef) fail("AUTH_TEST_SUPABASE_DB_URL must identify its project by direct host or Supabase pooler username.");
if (BLOCKED_PROJECT_REFS.has(databaseRef)) fail("DEV and Production database targets are forbidden.");
if (databaseRef !== allowedProjectRef.toLowerCase() || databaseRef !== apiRef) {
  fail("the database URL, API URL, and independent SQA allowlist ref must all match.");
}

console.log(`PASS: API and database target the explicitly allowlisted SQA project ${apiRef}.`);
