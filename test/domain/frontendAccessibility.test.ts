import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../../src/App";

describe("frontend accessibility and responsive contracts", () => {
  it("gives statistics, transfer, and maritime controls programmatic names", () => {
    const html = renderToString(createElement(App));

    expect(html).toContain('aria-label="Statistics player"');
    expect(html).toContain('aria-label="Token recipient"');
    expect(html).toContain('aria-label="Token amount"');
    expect(html).toContain('aria-label="Maritime give resource"');
    expect(html).toContain('aria-label="Maritime receive resource"');
  });

  it("exposes selected modes, live notices, and distinct Wood/Wool abbreviations", () => {
    const html = renderToString(createElement(App));
    const source = readFileSync("src/App.tsx", "utf8");

    expect(html).toContain('aria-pressed="true"');
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(html).toContain("Wd 0");
    expect(html).toContain("Wl 0");
  });

  it("defines clear disabled, touch, and narrow action-layout states", () => {
    const css = readFileSync("src/styles/app.css", "utf8");

    expect(css).toContain("button:disabled");
    expect(css).toContain("min-height: 44px");
    expect(css).toMatch(/@media \(max-width: 1180px\)[\s\S]*grid-template-rows:\s*520px auto auto auto/);
  });
});
