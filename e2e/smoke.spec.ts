import { expect, test } from "@playwright/test";

test.describe("sample-mode brief", () => {
  test("home shows the sample banner, hero and honest empty slots", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Sample data · not live")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Your podcast ecosystem/ })).toBeVisible();
    await expect(page.getByText(/sources collected/)).toBeVisible();
    // 2 sample guests qualify (≥ 1 show) → 1 honest empty slot, never padded
    await expect(page.getByText("No more guests qualify")).toHaveCount(1);
    await expect(page.getByText("Opportunity this week")).toBeVisible();
  });

  test("navigation works for every sidebar item", async ({ page }) => {
    await page.goto("/");
    for (const [label, heading] of [
      ["Guests", "Who's doing the rounds"],
      ["Topics", "What the ecosystem is talking about"],
      ["Sponsors", "Who's paying for founder ears"],
      ["Settings", "Your radar, your rules"],
      ["Home", "Your podcast ecosystem,"],
    ] as const) {
      await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: label }).click();
      await expect(page.getByRole("heading", { name: new RegExp(heading.replace(/[’']/g, ".")) }).first()).toBeVisible();
    }
  });

  test("ranked-signals search and tabs filter rows", async ({ page }) => {
    await page.goto("/");
    const table = page.locator(".overview-card");
    await table.getByRole("searchbox").or(table.getByPlaceholder(/Search guests/)).fill("Two");
    await expect(table.getByText("Sample Guest Two")).toBeVisible();
    await expect(table.getByText("Sample Guest One")).toHaveCount(0);
    await table.getByRole("tab", { name: /Sponsors/ }).click();
    await expect(table.getByText("No matches for that search.").or(table.getByText("Sample Brand"))).toBeVisible();
  });

  test("guest directory search → detail with evidence and AI draft panel", async ({ page }) => {
    await page.goto("/guests");
    await page.getByPlaceholder(/Search guests/).fill("one");
    await expect(page.getByText("Showing 1 of 2 guests")).toBeVisible();
    await page.getByRole("link", { name: /Sample Guest One/ }).click();
    await page.waitForURL(/\/guests\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Sample Guest One" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Appearance history")).toBeVisible();
    await expect(page.getByText(/AI draft · never sent automatically/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate|Regenerate/ })).toBeEnabled();
  });

  test("sponsor and topic detail pages render observed vs AI sections", async ({ page }) => {
    await page.goto("/sponsors");
    await page.getByRole("link", { name: /Sample Brand/ }).click();
    await expect(page.getByText("Confirmed sponsorship").first()).toBeVisible();
    await expect(page.getByText("Sponsor fit")).toBeVisible();
    await page.goto("/topics");
    await page.getByRole("link", { name: /Sample topic/ }).click();
    await expect(page.getByText("Counter-programming angles")).toBeVisible();
    await expect(page.getByText(/Insufficient public data/)).toBeVisible();
  });

  test("unknown detail id shows a 404, not an error", async ({ page }) => {
    const res = await page.goto("/guests/00000000-0000-4000-8000-999999999999");
    expect(res?.status()).toBe(404);
  });

  test("mobile layout opens the sidebar from the menu button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator(".sidebar.open")).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).click();
    await expect(page.locator(".sidebar.open")).toHaveCount(0);
  });
});

test.describe("settings flow (real config — creates and removes a temporary show)", () => {
  test("add by feed → validated → disable → remove", async ({ page }) => {
    const name = `E2E Temp Show ${Date.now() % 100000}`;
    await page.goto("/settings");
    await expect(page.getByText("Integration status")).toBeVisible();
    await page.getByRole("tab", { name: "Paste feeds" }).click();
    await page.getByLabel("Show name *").fill(name);
    await page.getByLabel("RSS feed URL").first().fill("https://feeds.zencastr.com/f/mbqvPYFP.rss");
    await page.getByRole("button", { name: /Add & validate/ }).click();
    const row = page.locator(".source-row", { hasText: name });
    await expect(row).toBeVisible({ timeout: 45_000 });
    const toggle = row.getByRole("switch", { name: new RegExp(`(Disable|Enable) ${name}`) });
    await expect(toggle).toHaveAttribute("aria-checked", "true"); // validated → active
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await row.getByRole("button", { name: `Edit ${name}` }).click();
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: /Remove/ }).click();
    await expect(page.locator(".source-row", { hasText: name })).toHaveCount(0, { timeout: 20_000 });
  });

  test("apple podcasts lookup returns real matches", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Show name").fill("Founder Thesis");
    await page.getByRole("button", { name: /Search Apple Podcasts/ }).click();
    await expect(page.locator(".apple-hit", { hasText: "Founder Thesis" }).first()).toBeVisible();
  });
});
