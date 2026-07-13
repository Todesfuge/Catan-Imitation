import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../../src/App";
import { createLocalGameTableView } from "../../src/app/localGameState";
import { getLegalRoadEdgeIds } from "../../src/domain/rules/building";
import {
  DevelopmentCardPanel,
  RoadBuildingTargets
} from "../../src/ui/DevelopmentCardPanel";
import { GameTable } from "../../src/ui/GameTable";
import { TurnFlowPanel } from "../../src/ui/TurnFlowPanel";
import { UtilityDialog } from "../../src/ui/UtilityDialog";
import {
  createScenarioAppState,
  createScenarioGame
} from "../fixtures/createScenarioGame";

function tableViewForGame(game: ReturnType<typeof createScenarioGame>) {
  return createLocalGameTableView({ ...createScenarioAppState(), game });
}

function renderScenarioTable(game = createScenarioGame()): string {
  return renderToString(
    createElement(GameTable, {
      view: tableViewForGame(game),
      dispatch: () => undefined
    })
  );
}

describe("product polish UI", () => {
  it("gates initial turn actions until the active player rolls", () => {
    const html = renderScenarioTable();
    const actionTag = (action: string) =>
      html.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>`))?.[0] ?? "";

    expect(actionTag("roll-dice")).not.toContain("disabled");
    for (const action of ["build-road", "build-settlement", "build-city", "buy-development", "maritime", "end-turn"]) {
      expect(actionTag(action), action).toContain("disabled");
    }
  });

  it("renders player-selected seven-roll discard controls", () => {
    const game = {
      ...createScenarioGame(),
      players: createScenarioGame().players.map((player) =>
        player.id === "p2"
          ? { ...player, resources: { ...player.resources, wood: 4, brick: 4 } }
          : player
      ),
      turnState: {
        phase: "awaitingDiscards" as const,
        pendingDiscards: { p2: 4 }
      }
    };
    const view = tableViewForGame(game);
    const html = renderToString(
      createElement(TurnFlowPanel, { game: view.game, gameControls: view.controlledPlayers, decisionPolicy: view.decisionPolicy, dispatch: () => undefined })
    );
    const visibleHtml = html.replaceAll("<!-- -->", "");

    expect(html).toContain('data-turn-flow="discard"');
    expect(visibleHtml).toContain("Loss must discard 4");
    expect(html).toContain('aria-label="Loss wood discard"');
    expect(html).toContain('aria-label="Loss brick discard"');
    expect(html).toContain("Submit Discard");
  });

  it("renders robber placement guidance and eligible victim controls", () => {
    const placementGame = {
      ...createScenarioGame(),
      turnState: {
        phase: "awaitingRobberPlacement" as const,
        pendingDiscards: {},
        pendingRobber: {
          source: "seven" as const,
          resumePhase: "action" as const,
          eligibleVictimIds: []
        }
      }
    };
    const placementView = tableViewForGame(placementGame);
    const placementHtml = renderToString(
      createElement(TurnFlowPanel, { game: placementView.game, gameControls: placementView.controlledPlayers, decisionPolicy: placementView.decisionPolicy, dispatch: () => undefined })
    );
    expect(placementHtml).toContain('data-turn-flow="robber-placement"');
    expect(placementHtml).toContain("Move the robber to a different hex");

    const victimGame = {
      ...placementGame,
      players: placementGame.players.map((player) =>
        player.id === "p2" ? { ...player, resources: { ...player.resources, ore: 1 } } : player
      ),
      turnState: {
        phase: "awaitingRobberVictim" as const,
        pendingDiscards: {},
        pendingRobber: {
          source: "seven" as const,
          resumePhase: "action" as const,
          targetHexId: "mountain-8",
          eligibleVictimIds: ["p2"]
        }
      }
    };
    const victimView = tableViewForGame(victimGame);
    const victimHtml = renderToString(
      createElement(TurnFlowPanel, { game: victimView.game, gameControls: victimView.controlledPlayers, decisionPolicy: victimView.decisionPolicy, dispatch: () => undefined })
    );
    expect(victimHtml).toContain('data-turn-flow="robber-victim"');
    expect(victimHtml).toContain("Choose a player to steal from");
    expect(victimHtml).toContain("Loss");
  });

  it("renders active-player development card kinds and playable counts", () => {
    const game = {
      ...createScenarioGame(),
      turn: 2,
      turnState: { phase: "action" as const, pendingDiscards: {}, developmentCardPlayed: false },
      players: createScenarioGame().players.map((player) =>
        player.id === "p1"
          ? {
              ...player,
              developmentCards: [
                { id: "knight", kind: "knight" as const, purchasedTurn: 1, revealed: false },
                { id: "roads", kind: "roadBuilding" as const, purchasedTurn: 1, revealed: false },
                { id: "plenty", kind: "yearOfPlenty" as const, purchasedTurn: 2, revealed: false },
                { id: "monopoly", kind: "monopoly" as const, purchasedTurn: 1, revealed: false },
                { id: "point", kind: "victoryPoint" as const, purchasedTurn: 2, revealed: false }
              ]
            }
          : player
      )
    };
    const html = renderToString(
      createElement(DevelopmentCardPanel, {
        state: tableViewForGame(game),
        dispatch: () => undefined
      })
    ).replaceAll("<!-- -->", "");

    expect(html).toContain('data-development-cards="hand"');
    expect(html).toContain("Knight ×1");
    expect(html).toContain("Road Building ×1");
    expect(html).toContain("Year of Plenty ×1");
    expect(html).toContain("Monopoly ×1");
    expect(html).toContain("Victory Point ×1");
    expect(html.match(/data-card-kind="yearOfPlenty"[^>]*disabled/)).not.toBeNull();
    expect(html.match(/data-card-kind="monopoly"[^>]*disabled/)).toBeNull();
  });

  it("renders explicit Year of Plenty and Monopoly resource choices", () => {
    const base = createScenarioGame();
    const plentyGame = {
      ...base,
      bank: { resources: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 } },
      turnState: {
        phase: "awaitingDevelopmentEffect" as const,
        pendingDiscards: {},
        developmentCardPlayed: true,
        pendingDevelopmentEffect: {
          kind: "yearOfPlenty" as const,
          playerId: "p1",
          remainingPicks: 2,
          resumePhase: "action" as const
        }
      }
    };
    const plentyHtml = renderToString(
      createElement(DevelopmentCardPanel, {
        state: tableViewForGame(plentyGame),
        dispatch: () => undefined
      })
    );
    expect(plentyHtml).toContain('data-development-effect="yearOfPlenty"');
    expect(plentyHtml).toContain("Choose 2 resources");
    expect(plentyHtml.match(/data-resource-choice="wood"[^>]*disabled/)).toBeNull();
    expect(plentyHtml).not.toContain('data-resource-choice="brick"');

    const monopolyGame = {
      ...base,
      turnState: {
        phase: "awaitingDevelopmentEffect" as const,
        pendingDiscards: {},
        developmentCardPlayed: true,
        pendingDevelopmentEffect: {
          kind: "monopoly" as const,
          playerId: "p1",
          resumePhase: "awaitingRoll" as const
        }
      }
    };
    const monopolyHtml = renderToString(
      createElement(DevelopmentCardPanel, {
        state: tableViewForGame(monopolyGame),
        dispatch: () => undefined
      })
    );
    expect(monopolyHtml).toContain('data-development-effect="monopoly"');
    expect(monopolyHtml).toContain("Choose a resource to monopolize");
    expect(monopolyHtml).toContain('data-resource-choice="ore"');
  });

  it("renders accessible legal road targets during Road Building", () => {
    const base = createScenarioGame();
    const game = {
      ...base,
      turnState: {
        phase: "awaitingDevelopmentEffect" as const,
        pendingDiscards: {},
        developmentCardPlayed: true,
        pendingDevelopmentEffect: {
          kind: "roadBuilding" as const,
          playerId: "p1",
          remainingRoads: 2,
          resumePhase: "action" as const
        }
      }
    };
    const legalEdges = getLegalRoadEdgeIds(game, "p1");
    const html = renderToString(
      createElement(
        "svg",
        null,
        createElement(RoadBuildingTargets, {
          game: tableViewForGame(game).game,
          edgeIds: legalEdges,
          dispatch: () => undefined
        })
      )
    );

    expect(legalEdges.length).toBeGreaterThan(0);
    expect(html.match(/data-road-building-target=/g)).toHaveLength(legalEdges.length);
    expect(html).toContain(`aria-label="Place free road ${legalEdges[0]}"`);
  });

  it("integrates the development-card controls and road targets into the app", () => {
    const html = renderToString(createElement(App));
    const source = readFileSync("src/ui/GameTable.tsx", "utf8");
    const actionDockSource = readFileSync("src/ui/ActionDock.tsx", "utf8");

    expect(html).toContain('data-development-cards="hand"');
    expect(actionDockSource).toContain("<DevelopmentCardPanel");
    expect(source).toContain("<RoadBuildingTargets");
    expect(html).not.toContain('data-action="play-knight"');
  });

  it("renders standard ports and effective maritime ratios", () => {
    const html = renderToString(createElement(App)).replaceAll("<!-- -->", "");
    const css = readFileSync("src/styles/app.css", "utf8");

    expect(html.match(/data-port-id=/g)).toHaveLength(9);
    expect(html).toContain("3:1");
    expect(html).toContain("2:1 Wood");
    for (const label of ["Wood 4:1", "Brick 4:1", "Wool 4:1", "Grain 4:1", "Ore 4:1"]) {
      expect(html).toContain(label);
    }
    expect(css).toContain(".port-marker");
    expect(css).toContain(".maritime-ratio-guide");
  });

  it("keeps robber targets accessible and disables actions outside live play", () => {
    const html = renderToString(createElement(App));
    const source = readFileSync("src/ui/GameTable.tsx", "utf8");
    const actionDockSource = readFileSync("src/ui/ActionDock.tsx", "utf8");

    expect(html).toContain('class="board-svg" role="group"');
    expect(actionDockSource).toContain("state.legality.actions");
    expect(actionDockSource).not.toContain("getActionAvailability");
    expect(source).toContain("<BoardActionTargets");
    expect(source).toContain("state.decisionPolicy.robberHex.targets.includes(hex.id)");
  });

  it("renders connected utility actions, phase guidance, and activity instead of fake chat", () => {
    const html = renderScenarioTable();

    expect(html).toContain('aria-label="Open settings"');
    expect(html).toContain('aria-label="Open rulebook"');
    expect(html).toContain('aria-label="Toggle fullscreen"');
    expect(html).toContain('aria-label="Open info"');
    expect(html).toContain("must roll or play a development card");
    expect(html).toContain("Activity");
    expect(html).not.toContain(">Chat<");
    expect(html).not.toContain("Local hot-seat demo");
  });

  it("renders a selectable canonical seed and both Local restart modes in Settings", () => {
    const view = tableViewForGame(createScenarioGame());
    const html = renderToString(createElement(UtilityDialog as never, {
      panel: "settings",
      state: view,
      onClose: () => undefined,
      onRestart: () => undefined
    }));

    expect(html).toContain(`value="${view.game.mapSeed}"`);
    expect(html).toContain("data-map-seed");
    expect(html).toContain('aria-label="Copy Seed"');
    expect(html).toContain("New Random Map");
    expect(html).toContain("Replay Current Map");
    expect(html).toContain('aria-live="polite"');
  });

  it("styles restart confirmation for focus visibility, touch targets, and responsive wrapping", () => {
    const css = readFileSync("src/styles/app.css", "utf8");

    expect(css).toMatch(/\.restart-actions[\s\S]*gap:\s*8px/);
    expect(css).toMatch(/\.restart-actions button[\s\S]*min-height:\s*44px/);
    expect(css).toContain(".restart-confirmation");
    expect(css).toMatch(/\.restart-confirmation button:focus-visible/);
    expect(css).toContain(".map-seed-value");
  });

  it("renders terrain icons and number-token pips for board inspectability", () => {
    const html = renderToString(createElement(App));

    expect(html).toContain("terrain-icon");
    expect(html).toContain("dice-pips");
    expect(html).toContain("Forest");
    expect(html).toContain("Mountain");
  });

  it("formats fractional yield values for readable tables", () => {
    const html = renderScenarioTable();

    expect(html).toContain("Grain 0.11");
    expect(html).toContain("Wool 0.28");
    expect(html).not.toContain("Grain 0.111111");
    expect(html).not.toContain("Wool 0.277777");
  });

  it("shows actual built roads without drawing every possible edge", () => {
    const game = createScenarioGame();
    const html = renderScenarioTable(game);

    expect(game.roads.length).toBeGreaterThan(0);
    expect(html).toContain("board-svg");
    expect(html).toContain("board-hex");
    expect(html).toContain("road-marker");
    expect(html).not.toContain("edge-guide");
  });

  it("uses SVG geometry instead of CSS-clipped boxes for the board", () => {
    const css = readFileSync("src/styles/app.css", "utf8");
    const html = renderToString(createElement(App));

    expect(html).toContain("<svg");
    expect(html).toContain("board-hex");
    expect(css).not.toContain("clip-path");
    expect(css).not.toContain(".hex {");
  });

  it("keeps SVG terrain polygons visibly colored", () => {
    const css = readFileSync("src/styles/app.css", "utf8");

    expect(css).toMatch(/\.terrain-forest\s*{[^}]*fill:/);
    expect(css).toMatch(/\.terrain-hill\s*{[^}]*fill:/);
    expect(css).toMatch(/\.terrain-pasture\s*{[^}]*fill:/);
    expect(css).toMatch(/\.terrain-field\s*{[^}]*fill:/);
    expect(css).toMatch(/\.terrain-mountain\s*{[^}]*fill:/);
    expect(css).toMatch(/\.terrain-desert\s*{[^}]*fill:/);
  });

  it("includes responsive layout safeguards for mobile controls and panels", () => {
    const css = readFileSync("src/styles/app.css", "utf8");

    expect(css).toContain("@media (max-width: 1180px)");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain(".utility-modal");
    expect(css).toContain(".phase-guidance");
    expect(css).toContain(".activity-shell");
    expect(css).toContain(".development-card-controls");
    expect(css).toContain(".development-resource-buttons");
    expect(css).toContain(".road-building-target");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("keeps turn overlays readable and activity lists independently scrollable", () => {
    const css = readFileSync("src/styles/app.css", "utf8");
    const appSource = readFileSync("src/ui/GameTable.tsx", "utf8");
    const turnFlowRule = css.match(/\.turn-flow-panel\s*{([^}]*)}/)?.[1] ?? "";
    const logListRule = css.match(/\.log-list\s*{([^}]*)}/)?.[1] ?? "";
    const diceListRule = css.match(/\.dice-income-list\s*{([^}]*)}/)?.[1] ?? "";
    const html = renderToString(createElement(App));

    expect(turnFlowRule).toMatch(/color:\s*#(?:f{3}|fffdf7|f7f3e8)/i);
    expect(logListRule).toMatch(/overflow-y:\s*auto/);
    expect(logListRule).toMatch(/min-height:\s*0/);
    expect(logListRule).toMatch(/touch-action:\s*pan-y/);
    expect(diceListRule).toMatch(/overflow-y:\s*auto/);
    expect(diceListRule).toMatch(/min-height:\s*0/);
    expect(diceListRule).toMatch(/touch-action:\s*pan-y/);
    expect(html).toContain('class="log-list" role="log" tabindex="0"');
    expect(appSource).not.toContain("game.log.slice(0, 8)");
  });
});
