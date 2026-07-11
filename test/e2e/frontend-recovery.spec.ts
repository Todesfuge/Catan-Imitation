import { expect, test, type Page } from "@playwright/test";

async function advanceBackToFirstPlayer(page: Page) {
  await page.getByRole("button", { name: "End Turn" }).click();
  for (let otherPlayer = 0; otherPlayer < 3; otherPlayer += 1) {
    await page.getByRole("button", { name: "Roll Dice" }).click();
    await page.getByRole("button", { name: "End Turn" }).click();
  }
}

async function setDeterministicTotal(page: Page, total: 2 | 3 | 7 | 8) {
  await page.evaluate((nextTotal) => {
    let call = 0;
    if (nextTotal === 2) {
      Math.random = () => 0;
    } else if (nextTotal === 3) {
      Math.random = () => (call++ % 2 === 0 ? 0 : 0.2);
    } else if (nextTotal === 7) {
      Math.random = () => (call++ % 2 === 0 ? 0.5 : 0.34);
    } else {
      Math.random = () => 0.5;
    }
  }, total);
}

test("a zero-token gathering completes without entering an unwinnable auction", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Commerce Guild" }).click();
  await page.getByRole("button", { name: "Start Gathering" }).click();
  await page.getByRole("button", { name: "Open Auctions" }).click();
  await expect(page.locator("#root .game-shell")).toBeVisible();
  await expect(page.getByRole("log")).toContainText(
    "The Commerce Guild auction ended because no player has guild tokens."
  );
  await expect(page.getByRole("button", { name: "Resolve Blind Box" })).toHaveCount(0);
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
  await page.getByRole("tab", { name: "Commerce Guild" }).click();

  await expect(page.getByLabel("Token recipient")).toHaveValue("p2");
  await expect(page.getByLabel("Token amount")).toHaveValue("1");
  await page.getByRole("button", { name: "Roll Dice" }).click();
  await page.getByRole("button", { name: "End Turn" }).click();
  await expect(page.getByLabel("Token recipient")).not.toHaveValue("p2");

  await page.getByRole("button", { name: "Start Gathering" }).click();
  await expect(page.getByLabel("Gathering player")).toHaveCount(1);
  await page.getByLabel("Gathering player").selectOption({ label: "Kay (0 tokens)" });
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
      const tradeHub = document.querySelector<HTMLElement>(".trade-hub-content:not([hidden])")!;
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
        tradeHubClientWidth: tradeHub.clientWidth,
        tradeHubScrollWidth: tradeHub.scrollWidth,
        viewportWidth: window.innerWidth
      };
    });

    expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
    expect(measurements.childBottom).toBeLessThanOrEqual(measurements.actionBottom + 1);
    expect(measurements.childRight).toBeLessThanOrEqual(measurements.actionRight + 1);
    expect(measurements.tradeHubScrollWidth).toBeLessThanOrEqual(measurements.tradeHubClientWidth + 1);
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

test("robber guidance stays readable and log/statistics lists reach their final entries", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  for (let completedTurn = 0; completedTurn < 8; completedTurn += 1) {
    await setDeterministicTotal(page, 2);
    await page.getByRole("button", { name: "Roll Dice" }).click();
    await page.getByRole("button", { name: "End Turn" }).click();
  }
  await setDeterministicTotal(page, 7);
  await page.getByRole("button", { name: "Roll Dice" }).click();

  const robberPanel = page.locator('[data-turn-flow="robber-placement"]');
  await expect(robberPanel).toBeVisible();
  const contrast = await robberPanel.evaluate((element) => {
    const parse = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = ([red, green, blue]: number[]) => {
      const channels = [red, green, blue].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const style = getComputedStyle(element);
    const foreground = luminance(parse(style.color));
    const background = luminance(parse(style.backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);

  const log = page.getByRole("log");
  const logScroll = await log.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(logScroll.scrollHeight).toBeGreaterThan(logScroll.clientHeight);
  await log.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await log.evaluate((element) => {
    element.scrollTop = 0;
  });
  await log.focus();
  await page.keyboard.press("End");
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(log.locator("p").last()).toHaveText("Welcome to Catan Imitation.");
  await expect(log.locator("p").last()).toBeInViewport();

  await page.getByRole("button", { name: "dice", exact: true }).click();
  const diceList = page.getByLabel("Income by player for selected dice total");
  const diceScroll = await diceList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(diceScroll.scrollHeight).toBeGreaterThan(diceScroll.clientHeight);
  await diceList.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => diceList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(diceList.locator("p").last()).toBeInViewport();
});

test("a public multi-resource offer is visible to every opponent and accepts atomically", async ({ page }) => {
  await page.goto("/");
  await setDeterministicTotal(page, 8);
  await page.getByRole("button", { name: "Roll Dice" }).click();

  await page.getByLabel("Offer Wool").fill("1");
  await page.getByLabel("Request Ore").fill("1");
  await page.getByRole("button", { name: "Publish Public Offer" }).click();

  await expect(page.getByText("Voyage1969 offers 1 Wool for 1 Ore")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept as Loss" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Accept as Kay" })).toBeDisabled();
  await expect(page.getByText("Kay cannot afford the requested resources")).toBeVisible();

  await page.getByRole("button", { name: "Accept as Loss" }).click();
  await expect(page.getByText("No public offer is active.")).toBeVisible();
  await expect(page.getByRole("log")).toContainText("Loss accepted Voyage1969's public player trade");

  await page.getByRole("tab", { name: "Commerce Guild" }).click();
  await expect(page.locator('[data-trade-hub-panel="commerce"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Commerce Guild" })).toBeVisible();
});

test("public offers cancel explicitly and clear when the proposer ends the turn", async ({ page }) => {
  await page.goto("/");
  await setDeterministicTotal(page, 8);
  await page.getByRole("button", { name: "Roll Dice" }).click();
  await page.getByLabel("Offer Wool").fill("1");
  await page.getByLabel("Request Ore").fill("1");
  await page.getByRole("button", { name: "Publish Public Offer" }).click();
  await page.getByRole("button", { name: "Cancel Offer" }).click();
  await expect(page.getByText("No public offer is active.")).toBeVisible();

  await page.getByLabel("Offer Wool").fill("1");
  await page.getByLabel("Request Ore").fill("1");
  await page.getByRole("button", { name: "Publish Public Offer" }).click();
  await page.getByRole("button", { name: "End Turn" }).click();
  await expect(page.getByText("No public offer is active.")).toBeVisible();
  await expect(page.locator(".turn-status strong")).toHaveText("Loss");
});

test("English defaults, Chinese retranslates history, and the locale survives reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Game Log" })).toBeVisible();
  await setDeterministicTotal(page, 8);
  await page.getByRole("button", { name: "Roll Dice" }).click();
  await expect(page.getByRole("log")).toContainText("Voyage1969 rolled 8");

  await page.getByRole("button", { name: "Open settings" }).click();
  const language = page.locator("[data-language-select]");
  await expect(language).toHaveValue("en");
  await language.selectOption("zh-CN");
  await expect(page.getByRole("button", { name: "掷骰子" })).toBeVisible();
  await page.locator("[data-dialog-close]").click();

  await expect(page.getByRole("heading", { name: "游戏日志" })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("Voyage1969 掷出了 8");
  await expect(page.getByText("产出统计")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "游戏日志" })).toBeVisible();
  await expect(page.getByRole("button", { name: "掷骰子" })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("欢迎来到卡坦岛仿制版");

  await page.getByRole("tab", { name: "商业公会" }).click();
  await page.getByRole("button", { name: "开始集会" }).click();
  await page.getByRole("button", { name: "开启拍卖" }).click();
  await expect(page.getByRole("log")).toContainText(
    "没有玩家持有公会代币，商业公会拍卖已结束。"
  );
  await expect(page.getByLabel("Voyage1969")).toHaveCount(0);
});

test("mobile keeps log and dice statistics internally scrollable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (let completedTurn = 0; completedTurn < 8; completedTurn += 1) {
    await setDeterministicTotal(page, 2);
    await page.getByRole("button", { name: "Roll Dice" }).click();
    await page.getByRole("button", { name: "End Turn" }).click();
  }
  await setDeterministicTotal(page, 7);
  await page.getByRole("button", { name: "Roll Dice" }).click();

  const log = page.getByRole("log");
  expect(await log.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
    await log.evaluate((element) => element.clientHeight)
  );
  await log.focus();
  await page.keyboard.press("End");
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "dice", exact: true }).click();
  const diceList = page.getByLabel("Income by player for selected dice total");
  expect(await diceList.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
    await diceList.evaluate((element) => element.clientHeight)
  );
  await diceList.focus();
  await page.keyboard.press("End");
  await expect.poll(() => diceList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
