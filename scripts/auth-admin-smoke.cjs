const { chromium } = require("playwright");

const protectedRoutes = [
  { path: "/admin/usuarios", heading: "Usuários e permissões" },
  { path: "/admin/departamentos", heading: "Departamentos e setores" },
];

async function main() {
  const email = process.env.AUTH_TEST_ADMIN_EMAIL;
  const password = process.env.AUTH_TEST_ADMIN_PASSWORD;
  const baseUrl = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000";

  if (!email || !password) {
    throw new Error("AUTH_TEST_ADMIN_EMAIL and AUTH_TEST_ADMIN_PASSWORD are required.");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  async function assertAdminPage(stage) {
    const currentUrl = page.url();
    const visibleText = await page.locator("body").innerText().catch(() => "");

    if (new URL(currentUrl).pathname !== "/admin") {
      throw new Error(
        `${stage}: expected /admin, but landed on ${currentUrl}. Visible page text: ${visibleText.slice(0, 500)}`,
      );
    }

    try {
      await page.getByRole("heading", { name: "Área administrativa" }).waitFor();
      await page.getByText("platform_admin", { exact: true }).waitFor();
    } catch {
      const updatedText = await page.locator("body").innerText().catch(() => "");
      throw new Error(
        `${stage}: /admin loaded without the expected platform_admin profile. Visible page text: ${updatedText.slice(0, 500)}`,
      );
    }
  }

  try {
    await page.goto(`${baseUrl}/login?next=%2Fadmin`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    try {
      await page.waitForURL((url) => url.pathname === "/admin", { timeout: 20000 });
    } catch {
      const currentUrl = page.url();
      const visibleText = await page.locator("body").innerText().catch(() => "");
      throw new Error(`Admin login did not reach /admin. Current URL: ${currentUrl}. Visible page text: ${visibleText.slice(0, 500)}`);
    }

    await assertAdminPage("Initial admin access");
    console.log("PASS: platform administrator can sign in and access /admin.");

    // Use a bounded document-ready wait; networkidle can hang on apps with persistent connections.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    await assertAdminPage("Admin access after refresh");
    console.log("PASS: administrator session persists and access remains allowed after refresh.");

    for (const route of protectedRoutes) {
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      if (new URL(page.url()).pathname !== route.path) {
        throw new Error(`Administrator was denied ${route.path}: ${page.url()}`);
      }
      await page.getByRole("heading", { name: route.heading }).waitFor();
      console.log(`PASS: platform administrator can access ${route.path} directly.`);
    }

    await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await assertAdminPage("Admin access before sign out");

    // Register the navigation waiter before clicking to avoid a client-router race.
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/login", { timeout: 20000 }),
      page.getByRole("button", { name: "Sair" }).click(),
    ]);
    console.log("PASS: administrator can sign out.");

    await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 20000 });
    await page.getByRole("heading", { name: "Bem-vindo de volta" }).waitFor();
    console.log("PASS: signed-out administrator is redirected away from /admin.");

    for (const route of protectedRoutes) {
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForURL((url) => url.pathname === "/login", { timeout: 20000 });
      await page.getByRole("heading", { name: "Bem-vindo de volta" }).waitFor();
      console.log(`PASS: signed-out administrator is redirected away from ${route.path}.`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Administrator authentication smoke test failed:", error.message);
  process.exit(1);
});
