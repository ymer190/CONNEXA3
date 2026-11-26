const { chromium } = require("playwright");

const protectedRoutes = ["/admin/usuarios", "/admin/departamentos"];

async function main() {
  const email = process.env.AUTH_TEST_USER_EMAIL;
  const password = process.env.AUTH_TEST_USER_PASSWORD;
  const baseUrl = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000";

  if (!email || !password) {
    throw new Error("AUTH_TEST_USER_EMAIL and AUTH_TEST_USER_PASSWORD are required.");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${baseUrl}/login?next=%2Fadmin`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL((url) => url.pathname === "/acesso-negado", { timeout: 20000 });
    await page.getByRole("heading", { name: "Acesso negado" }).waitFor();
    console.log("PASS: authenticated regular user is denied access to /admin.");

    // Test each protected module directly so client-side navigation cannot mask a server authorization gap.
    for (const route of protectedRoutes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForURL((url) => url.pathname === "/acesso-negado", { timeout: 20000 });
      await page.getByRole("heading", { name: "Acesso negado" }).waitFor();
      console.log(`PASS: authenticated regular user is denied direct access to ${route}.`);
    }

    await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForURL((url) => url.pathname === "/acesso-negado", { timeout: 20000 });
    console.log("PASS: authenticated session persists and admin access remains denied after refresh.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Authentication smoke test failed:", error.message);
  process.exit(1);
});
