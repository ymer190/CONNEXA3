const devProjectRef = "dzsacdtolxrqgwlekzdg";
const apiUrl = process.env.AUTH_TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const databaseUrl = process.env.AUTH_TEST_SUPABASE_DB_URL;

function fail(message) {
  console.error(`Isolated Supabase guard failed: ${message}`);
  process.exit(1);
}

if (!apiUrl) fail("AUTH_TEST_SUPABASE_URL is required.");

let api;
try {
  api = new URL(apiUrl);
} catch {
  fail("AUTH_TEST_SUPABASE_URL must be a valid URL.");
}

const apiProjectRef = /^([a-z0-9]+)\.supabase\.co$/i.exec(api.hostname)?.[1];
if (apiProjectRef === devProjectRef || api.hostname.includes(devProjectRef)) {
  fail("the shared connexa-dev project is forbidden for CI authentication and migration tests.");
}

if (databaseUrl) {
  let database;
  try {
    database = new URL(databaseUrl);
  } catch {
    fail("AUTH_TEST_SUPABASE_DB_URL must be a valid PostgreSQL URL.");
  }
  const directRef = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(database.hostname)?.[1];
  const poolerRef = /(?:^|\.)([a-z0-9]{20})$/i.exec(decodeURIComponent(database.username))?.[1];
  const databaseProjectRef = directRef ?? poolerRef;
  if (!apiProjectRef || !databaseProjectRef || apiProjectRef !== databaseProjectRef) {
    fail("the API URL and database URL must identify the same dedicated Supabase project.");
  }
  if (databaseProjectRef === devProjectRef) {
    fail("the shared connexa-dev database is forbidden for CI tests.");
  }
}

console.log(`PASS: CI target is isolated Supabase project ${apiProjectRef}.`);
