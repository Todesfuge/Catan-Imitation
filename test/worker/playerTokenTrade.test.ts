import { describe, expect, it } from "vitest";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import { parseMapSeed } from "../../src/domain/mapSeed";
import { createPlayerTradeOffer } from "../../src/domain/rules/playerTrade";
import { emptyResources } from "../../src/domain/types";
import { isPersistedMatchState } from "../../worker/room/roomValidation";

function actionMatch() {
  const seed = parseMapSeed("M1-1234567890ABCDEF");
  const match = createSetupMatch(["One", "Two", "Three"].map(nickname => ({ nickname })), { kind: "seed", seed }, {
    random: { nextInt: () => 0 }, nextMapSeed: () => seed, nextLogId: () => crypto.randomUUID(), now: () => 0
  });
  const { setup: _setup, ...game } = match.game;
  match.game = { ...game, phase: "playing", turnState: { phase: "action", pendingDiscards: {} } };
  match.game.players[0].resources.wood = 1;
  match.game.players[1].resources.grain = 1;
  match.game.players[0].guildTokens = 2;
  match.game.players[1].guildTokens = 3;
  match.game.bank.resources.wood -= 1;
  match.game.bank.resources.grain -= 1;
  return match;
}

describe("persisted player token offers", () => {
  it.each(["tokensForResources", "resourcesForTokens", "mixed", "legacyResources"] as const)(
    "preserves a %s offer across a storage round-trip", kind => {
      const match = actionMatch();
      const offered = { ...emptyResources(), wood: kind === "tokensForResources" ? 0 : 1 };
      const requested = { ...emptyResources(), grain: kind === "resourcesForTokens" ? 0 : 1 };
      match.pendingPlayerTrade = createPlayerTradeOffer(match.game, "p1", offered, requested,
        kind === "tokensForResources" || kind === "mixed" ? 2 : 0,
        kind === "resourcesForTokens" || kind === "mixed" ? 1 : 0);

      expect(isPersistedMatchState(match)).toBe(true);
      const restored = JSON.parse(JSON.stringify(match));
      expect(isPersistedMatchState(restored)).toBe(true);
      expect(restored.pendingPlayerTrade).toEqual(match.pendingPlayerTrade);
    }
  );

  it("rejects malformed, empty and unaffordable persisted token offers", () => {
    const match = actionMatch();
    match.pendingPlayerTrade = createPlayerTradeOffer(match.game, "p1", emptyResources(), { ...emptyResources(), grain: 1 }, 2);
    for (const amount of [-1, 0, 0.5, 3, null, Number.MAX_SAFE_INTEGER + 1]) {
      const invalid = structuredClone(match) as unknown as { pendingPlayerTrade: Record<string, unknown> };
      invalid.pendingPlayerTrade.offeredTokens = amount;
      expect(isPersistedMatchState(invalid)).toBe(false);
    }
    const invalid = structuredClone(match) as unknown as { pendingPlayerTrade: Record<string, unknown> };
    invalid.pendingPlayerTrade.requestedTokens = -1;
    expect(isPersistedMatchState(invalid)).toBe(false);
  });
});
