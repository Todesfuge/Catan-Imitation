import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { gameReducer } from "../../src/app/gameReducer";
import { createLocalGameTableView } from "../../src/app/localGameState";
import { emptyResources } from "../../src/domain/types";
import { PlayerTradePanel } from "../../src/ui/PlayerTradePanel";
import { TradeHubPanel } from "../../src/ui/TradeHubPanel";
import { I18nProvider } from "../../src/ui/i18n";
import { executeMatchCommandForTest } from "./matchCommandTestUtils";
import { createScenarioAppState } from "../fixtures/createScenarioGame";

function createTradeState() {
  const actionState = executeMatchCommandForTest(createScenarioAppState(), {
    type: "ROLL_DICE",
    playerId: "p1",
    dice: [4, 4]
  });
  return gameReducer(
    {
      ...actionState,
      game: {
        ...actionState.game,
        players: actionState.game.players.map((player) => ({
          ...player,
          resources:
            player.id === "p1"
              ? { ...emptyResources(), wood: 2, wool: 2 }
              : player.id === "p2"
                ? { ...emptyResources(), grain: 1, ore: 1 }
                : emptyResources()
        }))
      }
    },
    {
      type: "PUBLISH_PLAYER_TRADE",
      playerId: "p1",
      offered: { ...emptyResources(), wood: 1, wool: 1 },
      requested: { ...emptyResources(), grain: 1, ore: 1 }
    }
  );
}

describe("player trade UI", () => {
  it("renders a five-resource bundle editor and public offer summary", () => {
    const draftHtml = renderToString(
      createElement(PlayerTradePanel, {
        state: createLocalGameTableView(createScenarioAppState()),
        dispatch: () => undefined
      })
    );
    for (const resource of ["Wood", "Brick", "Wool", "Grain", "Ore"]) {
      expect(draftHtml).toContain(`aria-label="Offer ${resource}"`);
      expect(draftHtml).toContain(`aria-label="Request ${resource}"`);
    }
    expect(draftHtml).toContain("Publish Public Offer");

    const offerHtml = renderToString(
      createElement(PlayerTradePanel, {
        state: createLocalGameTableView(createTradeState()),
        dispatch: () => undefined
      })
    ).replaceAll("<!-- -->", "");
    expect(offerHtml).toContain(
      '<span class="sr-only">Voyage1969 offers 1 Wood, 1 Wool for 1 Grain, 1 Ore</span>'
    );
    expect(offerHtml).not.toContain(
      '<p aria-label="Voyage1969 offers 1 Wood, 1 Wool for 1 Grain, 1 Ore"'
    );
    const visualSummary = offerHtml.match(
      /<span aria-hidden="true" class="player-trade-summary-visual">([\s\S]*?)<\/span><\/p>/
    )?.[1] ?? "";
    const visualText = visualSummary.replace(/<[^>]+>/g, "");
    expect(visualText).not.toContain("Wood");
    expect(visualText).not.toContain("Wool");
    expect(offerHtml).toContain('data-resource-badge="wood"');
    expect(offerHtml).toContain('data-resource-badge="ore"');
    const chineseOfferHtml = renderToString(
      createElement(
        I18nProvider,
        { initialLocale: "zh-CN" },
        createElement(PlayerTradePanel, {
          state: createLocalGameTableView(createTradeState()),
          dispatch: () => undefined
        })
      )
    ).replaceAll("<!-- -->", "");
    expect(chineseOfferHtml).toContain(
      '<span class="sr-only">Voyage1969 提供 1 木材，1 羊毛，索取 1 粮食，1 矿石</span>'
    );
    expect(offerHtml.match(/<button[^>]*>Accept as Loss<\/button>/)?.[0] ?? "").not.toContain("disabled");
    expect(offerHtml.match(/<button[^>]*>Accept as Kay<\/button>/)?.[0] ?? "").toContain("disabled");
    expect(offerHtml).toContain("Kay cannot afford the requested resources");
    expect(offerHtml).toContain("Cancel Offer");
  });

  it("hosts Player Trade and Commerce Guild as separate tab panels", () => {
    const html = renderToString(
      createElement(TradeHubPanel, {
        state: createLocalGameTableView(createScenarioAppState()),
        dispatch: () => undefined
      })
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-controls="trade-panel-player"');
    expect(html).toContain('aria-labelledby="trade-tab-commerce"');
    expect(html).toContain("Player Trade");
    expect(html).toContain("Commerce Guild");
    expect(html).toContain('data-trade-hub-panel="player"');
    expect(html).toMatch(/data-trade-hub-panel="commerce"[^>]*hidden/);
  });
});
