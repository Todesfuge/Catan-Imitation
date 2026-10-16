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
    for (const resource of ["Wood", "Brick", "Wool", "Grain", "Ore", "Guild tokens"]) {
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

  it("shows tokens in the public offer and disables acceptance for an insufficient token balance", () => {
    const state = createTradeState();
    state.game.players[0].guildTokens = 3;
    state.game.players[1].guildTokens = 0;
    state.game.players[2].guildTokens = 2;
    state.game.players[2].resources = { ...emptyResources(), grain: 1, ore: 1 };
    state.pendingPlayerTrade = { ...state.pendingPlayerTrade!, offeredTokens: 1, requestedTokens: 2 };
    const view = createLocalGameTableView(state);
    const html = renderToString(createElement(PlayerTradePanel, { state: view, dispatch: () => undefined }))
      .replaceAll("<!-- -->", "");

    expect(html).toContain("1 guild token for 1 Grain, 1 Ore, 2 guild tokens");
    expect(html).toContain('data-trade-tokens="offered"');
    expect(html).toContain('data-trade-tokens="requested"');
    expect(view.controlledPlayers[1].tradeResponse?.enabled).toBe(false);
    expect(view.controlledPlayers[2].tradeResponse?.enabled).toBe(true);
    expect(html).toContain("Loss cannot afford the requested tokens.");
    const { pendingPlayerTrade: _offer, ...draft } = state;
    const draftHtml = renderToString(createElement(PlayerTradePanel, {
      state: createLocalGameTableView(draft), dispatch: () => undefined
    })).replaceAll("<!-- -->", "");
    expect(draftHtml).toContain("3 available");
    expect(draftHtml).toMatch(/aria-label="Offer Guild tokens"[^>]*max="3"/);
  });

  it("hosts all three trade types as separate tab panels", () => {
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
    expect(html).toContain("Maritime Trade");
    expect(html).toMatch(/data-trade-hub-panel="maritime"[^>]*hidden/);
    expect(html).toContain('data-trade-hub-panel="player"');
    expect(html).toMatch(/data-trade-hub-panel="commerce"[^>]*hidden/);
  });
});
