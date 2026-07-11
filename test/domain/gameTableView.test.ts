import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createInitialAppState, createLocalGameTableView } from "../../src/app/localGameState";
import { GameTable } from "../../src/ui/GameTable";

describe("shared game-table presentation boundary", () => {
  it("renders the existing local table from an explicit local view adapter", () => {
    const state = createInitialAppState();
    const view = createLocalGameTableView(state);
    const html = renderToString(
      createElement(GameTable, { view, dispatch: () => undefined })
    );

    expect(view.game).not.toBe(state.game);
    expect(view.game).not.toHaveProperty("developmentDeck");
    expect(view.game.developmentDeckCount).toBe(state.game.developmentDeck.length);
    expect(view.game.players[0]?.resources).toEqual(state.game.players[0]?.resources);
    expect(view.guild).toBe(state.guild);
    expect(html).toContain('class="game-shell"');
    expect(html).toContain('aria-label="Catan board"');
    expect(html).toContain('data-action="roll-dice"');
  });

  it("keeps the shared table independent from Worker and persisted online state", () => {
    const source = readFileSync("src/ui/GameTable.tsx", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");
    const panelSources = [
      "ActionDock",
      "BoardActionTargets",
      "CommercePanel",
      "DevelopmentCardPanel",
      "PlayerTradePanel",
      "TradeHubPanel",
      "TurnFlowPanel"
    ].map((name) => readFileSync(`src/ui/${name}.tsx`, "utf8"));

    expect(source).toContain("export interface GameTableView");
    expect(source).toContain("export type GameTableDispatch");
    expect(source).not.toMatch(/worker\//i);
    expect(source).not.toMatch(/PersistedRoom/);
    expect(source).not.toMatch(/\bMatchState\b/);
    expect(source).not.toMatch(/\.\.\/online\//);
    expect(appSource).toContain("<GameTable");
    expect(appSource).not.toMatch(/\.\/ui\/(?:ActionDock|BoardActionTargets|TradeHubPanel|TurnFlowPanel)/);
    for (const panelSource of panelSources) {
      expect(panelSource).not.toMatch(/app\/(?:gameReducer|localGameState)/);
      expect(panelSource).toMatch(/GameTable(?:Dispatch|View)/);
    }
  });
});
