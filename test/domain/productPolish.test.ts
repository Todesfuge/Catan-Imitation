import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../../src/App";
import { createDemoGame } from "../../src/domain/setup";

describe("product polish UI", () => {
  it("renders connected utility actions, phase guidance, and activity instead of fake chat", () => {
    const html = renderToString(createElement(App));

    expect(html).toContain('aria-label="Open settings"');
    expect(html).toContain('aria-label="Open rulebook"');
    expect(html).toContain('aria-label="Toggle fullscreen"');
    expect(html).toContain('aria-label="Open info"');
    expect(html).toContain("Place the next settlement");
    expect(html).toContain("Activity");
    expect(html).not.toContain(">Chat<");
    expect(html).not.toContain("Local hot-seat demo");
  });

  it("renders terrain icons and number-token pips for board inspectability", () => {
    const html = renderToString(createElement(App));

    expect(html).toContain("terrain-icon");
    expect(html).toContain("dice-pips");
    expect(html).toContain("Forest");
    expect(html).toContain("Mountain");
  });

  it("shows actual built roads without drawing every possible edge", () => {
    const game = createDemoGame();
    const html = renderToString(createElement(App));

    expect(game.roads.length).toBeGreaterThan(0);
    expect(html).toContain("road-marker");
    expect(html).not.toContain("edge-guide");
  });

  it("includes responsive layout safeguards for mobile controls and panels", () => {
    const css = readFileSync("src/styles/app.css", "utf8");

    expect(css).toContain("@media (max-width: 1180px)");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain(".utility-modal");
    expect(css).toContain(".phase-guidance");
    expect(css).toContain(".activity-shell");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });
});
