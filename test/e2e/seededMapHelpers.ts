import type { Page } from "@playwright/test";

export async function publicBoardSignature(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify({
    hexes: [...document.querySelectorAll<SVGGElement>(".hex-tile")].map((hex) => ({
      label: hex.getAttribute("aria-label"),
      text: hex.textContent?.replace(/\s+/g, " ").trim(),
      points: hex.querySelector("polygon")?.getAttribute("points")
    })),
    ports: [...document.querySelectorAll<SVGGElement>(".port-marker")].map((port) => ({
      label: port.getAttribute("aria-label"),
      lines: [...port.querySelectorAll("line")].map((line) => [
        line.getAttribute("x1"), line.getAttribute("y1"),
        line.getAttribute("x2"), line.getAttribute("y2")
      ])
    }))
  }));
}
