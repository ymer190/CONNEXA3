const { chromium } = require("playwright");

async function main() {
  const email = process.env.AUTH_TEST_ADMIN_EMAIL;
  const password = process.env.AUTH_TEST_ADMIN_PASSWORD;
  const baseUrl = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000";

  if (!email || !password) {
    throw new Error("AUTH_TEST_ADMIN_EMAIL and AUTH_TEST_ADMIN_PASSWORD are required.");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${baseUrl}/login?next=%2Fadmin`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    try {
      await page.waitForURL("**/admin", { timeout: 20000 });
    } catch {
      const currentUrl = page.url();
      const visibleText = await page.locator("body").innerText().catch(() => "");
      throw new Error(`Admin login did not reach /admin. Current URL: ${currentUrl}. Visible page text: ${visibleText.slice(0, 500)}`);
    }
    await page.getByRole("heading", { name: "Área administrativa" }).waitFor();
    await page.getByText("platform_admin", { exact: true }).waitFor();
    console.log("PASS: platform administrator can sign in and access /admin.");

    await page.reload();
    await page.waitForURL("**/admin", { timeout: 20000 });
    await page.getByText("platform_admin", { exact: true }).waitFor();
    console.log("PASS: administrator session persists and access remains allowed after refresh.");

    // Register the navigation waiter before clicking to avoid a client-router race.
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/login", { timeout: 20000 }),
      page.getByRole("button", { name: "Sair" }).click(),
    ]);
    console.log("PASS: administrator can sign out.");

    // Verify the protected route redirects a signed-out session to login.
    await page.goto(`${baseUrl}/admin`);
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 20000 });
    await page.getByRole("heading", { name: "Bem-vindo de volta" }).waitFor();
    console.log("PASS: signed-out administrator is redirected away from /admin.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Administrator authentication smoke test failed:", error.message);
  process.exit(1);
});
