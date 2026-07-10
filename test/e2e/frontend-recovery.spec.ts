import { expect, test, type Page } from "@playwright/test";

async function advanceBackToFirstPlayer(page: Page) {
  await page.getByRole("button", { name: "End Turn" }).click();
  for (let otherPlayer = 0; otherPlayer < 3; otherPlayer += 1) {
    await page.getByRole("button", { name: "Roll Dice" }).click();
    await page.getByRole("button", { name: "End Turn" }).click();
  }
}

async function setDeterministicTotal(page: Page, total: 3 | 8) {
  await page.evaluate((nextTotal) => {
    let call = 0;
    Math.random =
      nextTotal === 3
        ? () => (call++ % 2 === 0 ? 0 : 0.2)
        : () => 0.5;
  }, total);
}

test("an invalid command keeps the game mounted, reports a notice, and clears after success", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Gathering" }).click();
  await page.getByRole("button", { name: "Open Auctions" }).click();
  await page.getByRole("button", { name: "Resolve Blind Box" }).click();

  await expect(page.locator("#root .game-shell")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/positive bid/i);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Start New Game" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("unaffordable actions stay disabled and maritime choices are explicit", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Roll Dice" }).click();

  await expect(page.getByRole("button", { name: "Road", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Maritime give resource")).toBeVisible();
  await expect(page.getByLabel("Maritime receive resource")).toBeVisible();
});

test("New Game enters interactive snake-order setup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Start New Game" }).click();

  await expect(page.getByText("Place the next settlement")).toBeVisible();
  await expect(page.locator('[data-board-action-target="setupSettlement"]')).not.toHaveCount(0);
});

test("New Game completes all setup pairs and enters normal play", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Start New Game" }).click();

  for (let placement = 0; placement < 8; placement += 1) {
    const settlements = page.locator('[data-board-action-target="setupSettlement"]');
    expect(await settlements.count()).toBeGreaterThan(0);
    await settlements.first().press("Enter");
    const roads = page.locator('[data-board-action-target="setupRoad"]');
    expect(await roads.count()).toBeGreaterThan(0);
    await roads.first().press("Enter");
  }

  await expect(page.getByRole("button", { name: "Roll Dice" })).toBeEnabled();
  await expect(page.locator('[data-board-action-target^="setup"]')).toHaveCount(0);
});

test("explicit maritime choices fund selected Road, Settlement, and City targets", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    let call = 0;
    Math.random = () => (call++ % 2 === 0 ? 0 : 0.2);
  });
  await page.goto("/");

  for (let p1Turn = 0; p1Turn < 4; p1Turn += 1) {
    await page.getByRole("button", { name: "Roll Dice" }).click();
    if (p1Turn === 3) break;
    await page.getByRole("button", { name: "End Turn" }).click();
    for (let otherPlayer = 0; otherPlayer < 3; otherPlayer += 1) {
      await page.getByRole("button", { name: "Roll Dice" }).click();
      await page.getByRole("button", { name: "End Turn" }).click();
    }
  }

  const give = page.getByLabel("Maritime give resource");
  const receive = page.getByLabel("Maritime receive resource");
  await give.selectOption("grain");
  await receive.selectOption("wood");
  await page.getByRole("button", { name: "Maritime" }).click();
  await give.selectOption("grain");
  await receive.selectOption("brick");
  await page.getByRole("button", { name: "Maritime" }).click();

  const road = page.getByRole("button", { name: "Road", exact: true });
  await expect(road).toBeEnabled();
  await road.click();
  await expect(road).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-board-action-target="road"]')).toHaveCount(0);
  await road.click();
  const targets = page.locator('[data-board-visible-target="road"]');
  const targetCount = await targets.count();
  expect(targetCount).toBeGreaterThan(0);
  const extensionIndex = await page.evaluate(() => {
    const city = document.querySelector<SVGRectElement>(".building-marker.city")!;
    const cityX = Number(city.getAttribute("x")) + Number(city.getAttribute("width")) / 2;
    const cityY = Number(city.getAttribute("y")) + Number(city.getAttribute("height")) / 2;
    const lines = [...document.querySelectorAll<SVGLineElement>('[data-board-visible-target="road"]')];
    return Math.max(
      0,
      lines.findIndex((line) => {
        const endpoints = [
          [Number(line.getAttribute("x1")), Number(line.getAttribute("y1"))],
          [Number(line.getAttribute("x2")), Number(line.getAttribute("y2"))]
        ];
        return endpoints.every(([x, y]) => Math.abs(x - cityX) > 0.1 || Math.abs(y - cityY) > 0.1);
      })
    );
  });
  await targets.nth(extensionIndex).click();
  await expect(road).toBeDisabled();

  for (let grainTurn = 0; grainTurn < 4; grainTurn += 1) {
    await advanceBackToFirstPlayer(page);
    await setDeterministicTotal(page, 3);
    await page.getByRole("button", { name: "Roll Dice" }).click();
  }
  await give.selectOption("grain");
  await receive.selectOption("wood");
  await page.getByRole("button", { name: "Maritime" }).click();
  await give.selectOption("grain");
  await receive.selectOption("brick");
  await page.getByRole("button", { name: "Maritime" }).click();

  await advanceBackToFirstPlayer(page);
  await setDeterministicTotal(page, 8);
  await page.getByRole("button", { name: "Roll Dice" }).click();
  await advanceBackToFirstPlayer(page);
  await setDeterministicTotal(page, 3);
  await page.getByRole("button", { name: "Roll Dice" }).click();

  const settlement = page.getByRole("button", { name: "Settlement", exact: true });
  await expect(settlement).toBeEnabled();
  await settlement.click();
  const settlementTargets = page.locator('[data-board-visible-target="settlement"]');
  expect(await settlementTargets.count()).toBeGreaterThan(0);
  await settlementTargets.first().click();
  await expect(settlement).toBeDisabled();

  for (let grainTurn = 0; grainTurn < 7; grainTurn += 1) {
    await advanceBackToFirstPlayer(page);
    await setDeterministicTotal(page, 3);
    await page.getByRole("button", { name: "Roll Dice" }).click();
  }
  for (let trade = 0; trade < 3; trade += 1) {
    await give.selectOption("grain");
    await receive.selectOption("ore");
    await page.getByRole("button", { name: "Maritime" }).click();
  }

  const city = page.getByRole("button", { name: "City", exact: true });
  await expect(city).toBeEnabled();
  await city.click();
  const cityTargets = page.locator('[data-board-visible-target="city"]');
  expect(await cityTargets.count()).toBeGreaterThan(0);
  await cityTargets.first().click();
  await expect(city).toBeDisabled();
});

test("Commerce controls keep valid named selections across turns", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");

  await expect(page.getByLabel("Token recipient")).toHaveValue("p2");
  await expect(page.getByLabel("Token amount")).toHaveValue("1");
  await page.getByRole("button", { name: "Roll Dice" }).click();
  await page.getByRole("button", { name: "End Turn" }).click();
  await expect(page.getByLabel("Token recipient")).not.toHaveValue("p2");

  await page.getByRole("button", { name: "Start Gathering" }).click();
  await expect(page.getByLabel("Gathering player")).toHaveCount(1);
  await page.getByLabel("Gathering player").selectOption("p3");
  await expect(page.getByRole("status")).toContainText("Kay: 0 tokens");
  await expect(page.getByRole("status")).toContainText("4 redemptions remaining");
  await expect(page.getByRole("button", { name: "+Wood (19 bank)" })).toBeDisabled();
});

test("utility dialog owns focus, closes with Escape, and restores its opener", async ({ page }) => {
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Open settings" });
  await opener.click();

  await expect(page.getByRole("button", { name: "Close utility panel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("post-roll guidance describes the current action phase", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Roll Dice" }).click();

  await expect(page.locator(".phase-guidance")).toHaveText("Choose an action or end the turn");
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 }
]) {
  test(`${viewport.name} keeps actions contained and board-adjacent`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");

    const measurements = await page.evaluate(() => {
      const action = document.querySelector(".action-bar")!.getBoundingClientRect();
      const board = document.querySelector(".board-zone")!.getBoundingClientRect();
      const right = document.querySelector(".right-rail")!.getBoundingClientRect();
      const childBottom = Math.max(
        ...[...document.querySelectorAll(".action-bar > *")].map(
          (element) => element.getBoundingClientRect().bottom
        )
      );
      const childRight = Math.max(
        ...[...document.querySelectorAll(".action-bar > *")].map(
          (element) => element.getBoundingClientRect().right
        )
      );
      return {
        actionBottom: action.bottom,
        actionRight: action.right,
        actionTop: action.top,
        boardBottom: board.bottom,
        childBottom,
        childRight,
        documentWidth: document.documentElement.scrollWidth,
        rightTop: right.top,
        viewportWidth: window.innerWidth
      };
    });

    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
    expect(measurements.childBottom).toBeLessThanOrEqual(measurements.actionBottom + 1);
    expect(measurements.childRight).toBeLessThanOrEqual(measurements.actionRight + 1);
    if (viewport.width <= 768) {
      expect(measurements.actionTop).toBeGreaterThanOrEqual(measurements.boardBottom);
      expect(measurements.actionTop).toBeLessThan(measurements.rightTop);
    }
    if (viewport.width === 390) {
      const touchMeasurements = await page.evaluate(() => {
        const utility = document.querySelector(".utility-rail button")!.getBoundingClientRect();
        return { utilityHeight: utility.height, utilityWidth: utility.width };
      });
      expect(touchMeasurements.utilityHeight).toBeGreaterThanOrEqual(44);
      expect(touchMeasurements.utilityWidth).toBeGreaterThanOrEqual(44);
    }
  });
}

test("mobile setup board targets retain a 44px non-scaling hit stroke", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Start New Game" }).click();

  const target = page.locator('[data-board-action-target="setupSettlement"]');
  expect(await target.count()).toBeGreaterThan(0);
  const hitStyle = await target.first().evaluate((element) => ({
    strokeWidth: Number.parseFloat(getComputedStyle(element).strokeWidth),
    vectorEffect: getComputedStyle(element).vectorEffect
  }));
  expect(hitStyle.strokeWidth).toBeGreaterThanOrEqual(44);
  expect(hitStyle.vectorEffect).toBe("non-scaling-stroke");
});
