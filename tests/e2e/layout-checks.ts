import { expect, type Page } from "@playwright/test";
export async function expectAligned(page: Page) {
  const overflowing = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(
      ".page-content,.panel,.auth-main,.auth-form,.pending-panel,.sidebar nav .nav-link,input:not([type=checkbox]):not([type=radio]),textarea,select,.attempt-option",
    )).filter(element => {
      if (!element.getClientRects().length) return false;
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1;
    }).map(element => element.tagName + "." + element.className),
  );
  expect(overflowing).toEqual([]);
}
