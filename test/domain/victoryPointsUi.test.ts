import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createLocalGameTableView } from "../../src/app/localGameState";
import { GameRecordsPanel } from "../../src/ui/GameRecordsPanel";
import { GameTable, type GameTableView } from "../../src/ui/GameTable";
import { VictoryPointsPanel } from "../../src/ui/VictoryPointsPanel";
import { createScenarioAppState } from "../fixtures/createScenarioGame";

function scoreFixture(finished = false): GameTableView {
  const state = createScenarioAppState();
  state.game.phase = finished ? "gameOver" : "playing";
  state.game.largestArmyOwnerId = "p1";
  state.game.longestRoadOwnerId = "p3";
  state.game.players[0].prizeCards = 1;
  state.game.players[0].resources.wood = 4;
  state.game.players.forEach((player, index) => {
    player.developmentCards = Array.from({ length: index < 3 ? index + 1 : 0 }, (_, card) => ({
      id: `private-${index}-${card}`, kind: "victoryPoint", purchasedTurn: 0, revealed: false
    }));
  });
  return createLocalGameTableView(state);
}

function card(html: string, playerId: string) {
  return html.match(new RegExp(`<article[^>]*data-score-player="${playerId}"[^>]*>([\\s\\S]*?)</article>`))?.[1] ?? "";
}

function source(html: string, name: string) {
  return html.match(new RegExp(`data-score-source="${name}"[\\s\\S]*?<dd>(.*?)</dd>`))?.[1];
}

describe("victory point sources and player summaries", () => {
  it("shows development count in the metrics and resource total beside the resource details", () => {
    const html = renderToStaticMarkup(createElement(GameTable, { view: scoreFixture(), dispatch: () => undefined }));
    const firstPlayer = html.match(/<article class="player-card active">([\s\S]*?)<\/article>/)?.[1] ?? "";
    const metrics = firstPlayer.match(/class="player-metrics">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const inventory = firstPlayer.match(/class="resource-strip compact player-resource-row"([\s\S]*)/)?.[1] ?? "";
    expect(metrics).toContain('aria-label="Development: 1"');
    expect(metrics).toContain("lucide-scroll-text");
    expect(metrics).not.toContain("lucide-landmark");
    expect(metrics).not.toContain("Resources:");
    expect(inventory).toContain('data-resource-card-total="4"');
    expect(inventory).toContain('data-resource-badge="wood"');
    expect(inventory).toContain('data-resource-quantity="4"');
  });

  it("shows all public point sources and only the active local player's hidden points", () => {
    const html = renderToStaticMarkup(createElement(VictoryPointsPanel, { state: scoreFixture() }));
    const own = card(html, "p1");
    expect(source(own, "settlements")).toBe("0 pt");
    expect(source(own, "cities")).toBe("2 pt");
    expect(source(own, "largestArmy")).toBe("2 pt");
    expect(source(own, "prizeCards")).toBe("2 pt");
    expect(source(own, "hiddenVictoryPoints")).toBe("1 pt");
    expect(own).toContain("<strong>7 pt</strong>");
    expect(source(card(html, "p2"), "settlements")).toBe("1 pt");
    expect(source(card(html, "p3"), "longestRoad")).toBe("2 pt");
    for (const id of ["p2", "p3", "p4"]) {
      expect(source(card(html, id), "hiddenVictoryPoints")).toBe("Hidden");
      expect(card(html, id)).toContain("Not public");
    }
    expect(html).not.toContain("private-");
  });

  it("keeps the caller's own hidden points available when another online player is active", () => {
    const view = scoreFixture();
    const html = renderToStaticMarkup(createElement(VictoryPointsPanel, {
      state: { ...view, controlledPlayers: [{ ...view.controlledPlayers[2], isActive: false }] }
    }));
    expect(source(card(html, "p3"), "hiddenVictoryPoints")).toBe("3 pt");
    expect(source(card(html, "p1"), "hiddenVictoryPoints")).toBe("Hidden");
    expect(source(card(html, "p2"), "hiddenVictoryPoints")).toBe("Hidden");
  });

  it("reveals final point totals and hidden point sources after the game ends", () => {
    const html = renderToStaticMarkup(createElement(VictoryPointsPanel, { state: scoreFixture(true) }));
    expect(source(card(html, "p2"), "hiddenVictoryPoints")).toBe("2 pt");
    expect(card(html, "p2")).toContain("<strong>3 pt</strong>");
    expect(card(html, "p3")).toContain("<strong>5 pt</strong>");
    expect(html).not.toContain("Not public");
  });

  it("adds a separate victory-point tab without replacing the log or yield statistics", () => {
    const html = renderToStaticMarkup(createElement(GameRecordsPanel, { state: scoreFixture(), dispatch: () => undefined }));
    for (const name of ["log", "statistics", "victory"]) {
      expect(html).toContain(`aria-controls="records-panel-${name}"`);
    }
    expect(html).toContain("Victory Points");
    expect(html).toContain("Victory point sources");
  });
});
