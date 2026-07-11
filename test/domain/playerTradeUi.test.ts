import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createInitialAppState, gameReducer } from "../../src/app/gameReducer";
import { emptyResources } from "../../src/domain/types";
import { PlayerTradePanel } from "../../src/ui/PlayerTradePanel";
import { TradeHubPanel } from "../../src/ui/TradeHubPanel";
import { executeMatchCommandForTest } from "./matchCommandTestUtils";

function createTradeState() {
  const actionState = executeMatchCommandForTest(createInitialAppState(), {
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
        state: createInitialAppState(),
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
        state: createTradeState(),
        dispatch: () => undefined
      })
    ).replaceAll("<!-- -->", "");
    const visibleText = offerHtml.replace(/<[^>]+>/g, "");
    expect(visibleText).toContain("Voyage1969 offers 1 Wood, 1 Wool for 1 Grain, 1 Ore");
    expect(offerHtml.match(/<button[^>]*>Accept as Loss<\/button>/)?.[0] ?? "").not.toContain("disabled");
    expect(offerHtml.match(/<button[^>]*>Accept as Kay<\/button>/)?.[0] ?? "").toContain("disabled");
    expect(offerHtml).toContain("Kay cannot afford the requested resources");
    expect(offerHtml).toContain("Cancel Offer");
  });

  it("hosts Player Trade and Commerce Guild as separate tab panels", () => {
    const html = renderToString(
      createElement(TradeHubPanel, {
        state: createInitialAppState(),
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
