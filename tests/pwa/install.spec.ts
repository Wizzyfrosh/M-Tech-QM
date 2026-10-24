import { test, expect } from "@playwright/test";
test("production PWA has valid assets, blocks script injection and never caches private routes", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto("/install");
  const csp = response!.headers()["content-security-policy"];
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(response!.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await expect(page.locator("#qms-launch-screen")).not.toBeVisible();
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", scope: "/", id: "/" });
  for (const icon of manifest.icons) {
    const asset = await page.request.get(icon.src);
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/png");
    const bytes = await asset.body();
    expect(bytes.readUInt32BE(16)).toBe(Number(icon.sizes.split("x")[0]));
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.setAttribute("onclick", "window.__injected = true");
    document.body.append(button);
    button.click();
  });
  expect(await page.evaluate(() => "__injected" in window)).toBe(false);
  await page.goto("/sign-in");
  await page.evaluate(async () => { await fetch("/api/me"); });
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name =>
    (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat());
  expect(cached.toSorted()).toEqual(["/m-tech-hub-logo.jpg", "/offline.html", "/pwa/icon/192", "/pwa/icon/512"].toSorted());
  await context.setOffline(true);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  expect(await page.content()).not.toContain("Profile details");
  await context.setOffline(false);
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Install on your device" })).toBeVisible();
  expect(errors).toEqual([]);
});
