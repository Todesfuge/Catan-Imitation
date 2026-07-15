import { expect, test, type Locator, type Page } from "@playwright/test";

async function openLocal(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Local Game" }).click();
}

async function openRulebook(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Open rulebook" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName("Rulebook");
  return dialog;
}

async function expectSelectedAndFocused(tab: Locator): Promise<void> {
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(tab).toBeFocused();
}

test("chapter selection resets scroll, Escape restores the opener, and reopening starts fresh", async ({ page }) => {
  await openLocal(page);
  const opener = page.getByRole("button", { name: "Open rulebook" });
  const dialog = await openRulebook(page);
  const quickStart = dialog.getByRole("tab", { name: "Quick Start" });
  const baseRules = dialog.getByRole("tab", { name: "Base Rules" });
  const panel = dialog.getByRole("tabpanel");

  await expect(quickStart).toHaveAttribute("aria-selected", "true");
  await panel.evaluate((element) => { element.scrollTop = 240; });
  await baseRules.click();
  await expect(baseRules).toHaveAttribute("aria-selected", "true");
  await expect(panel).toHaveAttribute("aria-labelledby", "rulebook-tab-baseRules");
  await expect(panel.getByRole("heading", { name: "Base rules" })).toBeVisible();
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBe(0);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();

  const reopened = await openRulebook(page);
  await expect(reopened.getByRole("tab", { name: "Quick Start" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(reopened.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "rulebook-tab-quickStart"
  );
});

test("arrow, Home, and End keys wrap, select, and focus the chapter tabs", async ({ page }) => {
  await openLocal(page);
  const dialog = await openRulebook(page);
  const quickStart = dialog.getByRole("tab", { name: "Quick Start" });
  const baseRules = dialog.getByRole("tab", { name: "Base Rules" });
  const commerceGuild = dialog.getByRole("tab", { name: "Commerce Guild" });
  const quickReference = dialog.getByRole("tab", { name: "Quick Reference" });

  await quickStart.focus();
  await page.keyboard.press("ArrowRight");
  await expectSelectedAndFocused(baseRules);
  await page.keyboard.press("ArrowRight");
  await expectSelectedAndFocused(commerceGuild);
  await page.keyboard.press("ArrowRight");
  await expectSelectedAndFocused(quickReference);
  await page.keyboard.press("ArrowRight");
  await expectSelectedAndFocused(quickStart);
  await page.keyboard.press("ArrowLeft");
  await expectSelectedAndFocused(quickReference);
  await page.keyboard.press("Home");
  await expectSelectedAndFocused(quickStart);
  await page.keyboard.press("End");
  await expectSelectedAndFocused(quickReference);
});

test("the in-rulebook language selector updates live without changing chapters", async ({ page }) => {
  await openLocal(page);
  const dialog = await openRulebook(page);
  await dialog.getByRole("tab", { name: "Base Rules" }).click();

  const language = dialog.locator("[data-rulebook-language-select]");
  await language.selectOption("zh-CN");
  await expect(dialog).toHaveAccessibleName("规则说明");
  await expect(dialog.getByRole("tab", { name: "基础规则" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(dialog.getByRole("tabpanel")).toContainText("产出与银行");

  await language.selectOption("en");
  await expect(dialog).toHaveAccessibleName("Rulebook");
  await expect(dialog.getByRole("tab", { name: "Base Rules" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(dialog.getByRole("tabpanel")).toContainText("Production and the bank");
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 768 },
  { name: "mobile", width: 390, height: 844 }
] as const) {
  test(`${viewport.name} keeps the dialog contained and the final rule reachable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openLocal(page);
    const dialog = await openRulebook(page);
    const card = dialog.locator(".modal-card--rulebook");
    const close = dialog.getByRole("button", { name: "Close utility panel" });
    const tabs = dialog.getByRole("tablist");
    const panel = dialog.getByRole("tabpanel");

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);

    for (const locator of [card, close, tabs]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(geometry.viewportWidth + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    }

    const scroll = await panel.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);

    await dialog.getByRole("tab", { name: "Quick Reference" }).click();
    const finalSentinel = panel.locator('[data-rulebook-topic="final"]');
    await finalSentinel.scrollIntoViewIfNeeded();
    await expect(finalSentinel).toBeVisible();
    await expect(finalSentinel).toContainText("End of quick reference");
    expect(await panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });
}
