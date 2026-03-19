#!/usr/bin/env node

const { chromium } = require("playwright");

function printUsage() {
  console.log(`
Health Score UI smoke check

Required:
  Set either HEALTH_SCORE_URL or HEALTH_SCORE_PROPERTY_ID.

Environment variables:
  FRONTEND_BASE_URL          Default: http://localhost:3000
  HEALTH_SCORE_URL           Full URL to the health score page
  HEALTH_SCORE_PROPERTY_ID   Property id (used to build /dashboard/properties/:id/health-score)
  HEALTH_SCORE_EMAIL         Optional login email if redirected to /login
  HEALTH_SCORE_PASSWORD      Optional login password if redirected to /login
  HEALTH_SCORE_HEADLESS      Default: true (set "false" to watch the run)
  HEALTH_SCORE_TIMEOUT_MS    Default: 30000
  HEALTH_SCORE_SCREENSHOT    Optional absolute path to save a screenshot

Example:
  HEALTH_SCORE_PROPERTY_ID=abc123 HEALTH_SCORE_EMAIL=user@example.com HEALTH_SCORE_PASSWORD=secret \\
  node apps/backend/scripts/healthScoreUiSmokeCheck.js
`);
}

function normalizeBool(value, fallback) {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return !(normalized === "false" || normalized === "0" || normalized === "no");
}

async function maybeLogin(page, timeoutMs, email, password) {
  const onLoginPage = page.url().includes("/login");
  const hasLoginInputs =
    (await page.locator("#email").count()) > 0 &&
    (await page.locator("#password").count()) > 0;

  if (!onLoginPage && !hasLoginInputs) return;

  if (!email || !password) {
    throw new Error(
      "Reached login page but HEALTH_SCORE_EMAIL / HEALTH_SCORE_PASSWORD were not provided."
    );
  }

  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.locator("button[type='submit']").first().click();
  await page.waitForLoadState("networkidle", { timeout: timeoutMs });
}

async function assertHealthScoreContract(page, timeoutMs) {
  await page.getByText("Property Health Report").first().waitFor({ timeout: timeoutMs });
  await page.getByText("Health Score").first().waitFor({ timeout: timeoutMs });

  const scoreShownAs100 = await page.evaluate(() => {
    const textNodes = Array.from(document.querySelectorAll("body *"))
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    return textNodes.some((text) => /\b\d{1,3}\/100\b/.test(text));
  });

  if (!scoreShownAs100) {
    throw new Error("Primary score contract failed: could not find a score rendered as X/100.");
  }
}

async function assertLedgerSection(page, timeoutMs) {
  await page.getByText("Health Factor Ledger").first().waitFor({ timeout: timeoutMs });

  const requiredLabels = ["Needs Attention", "Monitor Closely", "Healthy Signals"];
  for (const label of requiredLabels) {
    await page.getByText(label).first().waitFor({ timeout: timeoutMs });
  }
}

async function run() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const baseUrl = process.env.FRONTEND_BASE_URL || "http://localhost:3000";
  const propertyId = process.env.HEALTH_SCORE_PROPERTY_ID;
  const explicitUrl = process.env.HEALTH_SCORE_URL;
  const url =
    explicitUrl ||
    (propertyId ? `${baseUrl.replace(/\/$/, "")}/dashboard/properties/${propertyId}/health-score` : null);

  if (!url) {
    throw new Error(
      "Missing target URL. Set HEALTH_SCORE_URL or HEALTH_SCORE_PROPERTY_ID."
    );
  }

  const headless = normalizeBool(process.env.HEALTH_SCORE_HEADLESS, true);
  const timeoutMs = Number(process.env.HEALTH_SCORE_TIMEOUT_MS || 30000);
  const email = process.env.HEALTH_SCORE_EMAIL;
  const password = process.env.HEALTH_SCORE_PASSWORD;
  const screenshotPath = process.env.HEALTH_SCORE_SCREENSHOT;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();

  try {
    console.log(`[health-score-smoke] Opening ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await maybeLogin(page, timeoutMs, email, password);

    if (page.url().includes("/login")) {
      throw new Error("Still on /login after attempted authentication.");
    }

    if (page.url() !== url) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    }

    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
    await assertHealthScoreContract(page, timeoutMs);
    await assertLedgerSection(page, timeoutMs);

    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`[health-score-smoke] Screenshot saved to ${screenshotPath}`);
    }

    console.log("[health-score-smoke] PASS");
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error("[health-score-smoke] FAIL");
  console.error(error?.stack || String(error));
  process.exit(1);
});
