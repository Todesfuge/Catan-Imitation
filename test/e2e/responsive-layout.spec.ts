import { expect, test } from "@playwright/test";
import { openTrading } from "./tradeUiHelpers";

for (const viewport of [{ width: 402, height: 874 }, { width: 412, height: 915 }, { width: 430, height: 932 }]) {
  test(`${viewport.width}px can hide information and click the enlarged board`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Play Local Game" }).click();
    const map = page.locator(".board-svg");
    const info = page.locator("#game-info");
    const initialWidth = await map.evaluate((element) => element.getBoundingClientRect().width);
    await page.getByRole("button", { name: "Hide info and actions" }).click();
    const toggle = page.getByRole("button", { name: "Show info and actions" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(info).not.toBeVisible();
    await expect(toggle).toBeInViewport();
    await expect.poll(() => map.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(initialWidth * 1.8);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height + 1);

    const targets = page.locator('[data-board-action-target="setupSettlement"]');
    const visibleIndex = await targets.evaluateAll((elements) => {
      const viewportBox = document.querySelector(".board-viewport")!.getBoundingClientRect();
      return elements.findIndex((element) => {
        const box = element.getBoundingClientRect();
        return box.x > viewportBox.x + 22 && box.right < viewportBox.right - 22 &&
          box.y > viewportBox.y + 22 && box.bottom < viewportBox.bottom - 22;
      });
    });
    expect(visibleIndex).toBeGreaterThanOrEqual(0);
    await page.locator('[data-board-visible-target="setupSettlement"]').nth(visibleIndex).click();
    await expect(page.locator(".building-marker")).toHaveCount(1);
    await expect(page.locator('[data-board-action-target="setupRoad"]').first()).toBeVisible();
    await expect(info).not.toBeVisible();

    await toggle.click();
    await expect(page.getByRole("button", { name: "Hide info and actions" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-hand-summary]")).toBeVisible();
    await expect(page.locator(".action-bar")).toBeVisible();
    await expect.poll(() => map.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(initialWidth, 0);
  });
}

for (const width of [1280, 1440, 1920]) {
  test(`${width}px keeps the dice result inside its group and clear of build actions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Play Local Game" }).click();
    const bounds = await page.evaluate(() => {
      const group = document.querySelector(".roll-action-group")!.getBoundingClientRect();
      const dice = document.querySelector(".dice-readout")!.getBoundingClientRect();
      const road = document.querySelector('[data-action="build-road"]')!.getBoundingClientRect();
      return { groupRight: group.right, diceRight: dice.right, roadLeft: road.left,
        documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
    });
    expect(bounds.diceRight).toBeLessThanOrEqual(bounds.groupRight + 1);
    expect(bounds.diceRight).toBeLessThanOrEqual(bounds.roadLeft);
    expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth);
  });
}

for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px supports board zoom, touch panning, hand access and compact trading`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Play Local Game" }).click();
    const board = page.locator(".board-viewport");
    const map = page.locator(".board-svg");
    await expect(board).toHaveAttribute("tabindex", "0");
    const initialWidth = await map.evaluate(e => e.getBoundingClientRect().width);
    const numberPixels = await page.locator(".dice-number").first().evaluate(e =>
      Number.parseFloat(getComputedStyle(e).fontSize) * (e as unknown as SVGGraphicsElement).getScreenCTM()!.a
    );
    expect(numberPixels).toBeGreaterThanOrEqual(12);
    await page.getByRole("button", { name: "Zoom in board" }).click();
    await expect.poll(() => map.evaluate(e => e.getBoundingClientRect().width)).toBeGreaterThan(initialWidth * 1.4);
    const beforePan = await board.evaluate(e => e.scrollLeft);
    const box = (await board.boundingBox())!;
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    const x = box.x + box.width * 0.75;
    const y = box.y + box.height / 2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step += 1) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - step * 16, y }] });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => board.evaluate(e => e.scrollLeft)).toBeGreaterThan(beforePan + 20);
    await session.detach();
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await expect.poll(() => map.evaluate(e => e.getBoundingClientRect().width)).toBeCloseTo(initialWidth, 0);
    await expect.poll(() => board.evaluate(e => e.scrollLeft)).toBe(0);
    await expect(page.locator(".building-marker")).toHaveCount(0);
    const hand = page.locator("[data-hand-summary]");
    await expect(hand).toBeVisible();
    await expect(hand.locator("[data-resource-badge]")).toHaveCount(5);
    expect((await hand.boundingBox())!.y).toBeLessThan((await page.locator(".action-bar").boundingBox())!.y);

    await openTrading(page, "player");
    const playerHeight = (await page.locator(".modal-card--trade").boundingBox())!.height;
    for (const input of await page.getByRole("dialog").getByRole("spinbutton").all()) {
      expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    }
    await openTrading(page, "maritime");
    expect((await page.locator(".modal-card--trade").boundingBox())!.height).toBeLessThan(playerHeight);
    await openTrading(page, "commerce");
    const panel = page.locator('.trade-hub-content:not([hidden])');
    await panel.evaluate(e => { e.scrollTop = e.scrollHeight; });
    await expect(page.getByRole("button", { name: "Close utility panel" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
