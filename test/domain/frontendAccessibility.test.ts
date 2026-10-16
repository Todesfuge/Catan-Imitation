import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../../src/App";
import { createInitialAppState, createLocalGameTableView } from "../../src/app/localGameState";
import { TradeHubPanel } from "../../src/ui/TradeHubPanel";
import { StatsPanel } from "../../src/ui/GameRecordsPanel";

function renderStatistics() {
  return renderToString(createElement(StatsPanel, {
    state: createLocalGameTableView(createInitialAppState()), dispatch: () => undefined
  }));
}

describe("frontend accessibility and responsive contracts", () => {
  it("gives statistics, player trade, and maritime controls programmatic names", () => {
    const html = renderToString(createElement(TradeHubPanel, {
      state: createLocalGameTableView(createInitialAppState()), dispatch: () => undefined
    }));

    expect(renderStatistics()).toContain('aria-label="Statistics player"');
    expect(html).toContain('aria-label="Offer Guild tokens"');
    expect(html).toContain('aria-label="Request Guild tokens"');
    expect(html).not.toContain('class="token-transfer"');
    expect(html).toContain('aria-label="Maritime give resource"');
    expect(html).toContain('aria-label="Maritime receive resource"');
    expect(html).toContain('class="resource-choice-group" role="group"');
    expect(html).toContain('data-maritime-give="wood"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-describedby="maritime-unavailable-reason"');
  });

  it("exposes selected modes, live notices, and complete icon semantics", () => {
    const html = renderToString(createElement(App));
    const source = readFileSync("src/ui/GameTable.tsx", "utf8");

    expect(renderStatistics()).toContain('aria-pressed="true"');
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Wood: 0, Brick: 0, Wool: 0, Grain: 0, Ore: 0"');
    expect(html).not.toContain("Wd 0");
    expect(html).not.toContain("Wl 0");
  });

  it("defines clear disabled, touch, and narrow action-layout states", () => {
    const css = readFileSync("src/styles/app.css", "utf8");

    expect(css).toContain("button:disabled");
    expect(css).toContain("min-height: 44px");
    expect(css).toMatch(/@media \(max-width: 1180px\)[\s\S]*grid-template-rows:\s*520px auto auto/);
  });
});
