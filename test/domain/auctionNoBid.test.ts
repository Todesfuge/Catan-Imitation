import { describe, expect, it, vi } from "vitest";
import { gameReducer } from "../../src/app/gameReducer";
import {
  createCommerceGuild,
  openGuildAuction,
  resolveAuctionRound,
  startGuildGathering,
  type CommerceGuildState
} from "../../src/domain/expansion/commerceGuild";
import {
  createScenarioAppState,
  createScenarioGame
} from "../fixtures/createScenarioGame";
import type { GameState } from "../../src/domain/types";
import { translate } from "../../src/ui/i18n";

function withGuildTokens(game: GameState, tokenCounts: Record<string, number>): GameState {
  return {
    ...game,
    players: game.players.map((player) => ({
      ...player,
      guildTokens: tokenCounts[player.id] ?? 0
    }))
  };
}

function gatheringGuild(auctionRound = 1, game: GameState = createScenarioGame()): CommerceGuildState {
  const actionGame = {
    ...game,
    turnState: { phase: "action" as const, pendingDiscards: {} }
  };
  const initialGuild = createCommerceGuild(game.players.length, game.turn);
  const guild = startGuildGathering(actionGame, {
    ...initialGuild,
    gatheringCooldown: { availableAtTurn: game.turn, displayDuration: game.players.length }
  }, game.activePlayerId, false);
  return {
    ...guild,
    gathering: {
      ...guild.gathering,
      phase: "auction",
      auctionRound
    }
  };
}

describe("Commerce Guild auctions without bids", () => {
  it("completes immediately when no player owns a guild token", () => {
    const game = withGuildTokens(createScenarioGame(), {});

    const guild = openGuildAuction(game, gatheringGuild(1, game));

    expect(guild.gathering.phase).toBe("complete");
    expect(guild.gathering.auctionRound).toBe(1);
  });

  it("advances one eligible all-pass round without payment, reward, or randomness", () => {
    const game = withGuildTokens(createScenarioGame(), { p1: 2 });
    const random = vi.fn(() => {
      throw new Error("random must not be called for an all-pass round");
    });

    const result = resolveAuctionRound(
      game,
      gatheringGuild(),
      { p1: 0, p2: 0, p3: 0, p4: 0 },
      random
    );

    expect(result.kind).toBe("noBid");
    expect(result.game).toEqual(game);
    expect(result.guild.gathering).toMatchObject({
      phase: "auction",
      auctionRound: 2,
      auctionResults: []
    });
    expect(random).not.toHaveBeenCalled();
  });

  it("completes gathering when everyone passes auction round three", () => {
    const game = withGuildTokens(createScenarioGame(), { p1: 2 });

    const result = resolveAuctionRound(
      game,
      gatheringGuild(3),
      { p1: 0, p2: 0, p3: 0, p4: 0 },
      () => 0.6
    );

    expect(result.kind).toBe("noBid");
    expect(result.guild.gathering.phase).toBe("complete");
    expect(result.guild.gathering.auctionRound).toBe(4);
    expect(result.guild.gathering.auctionResults).toEqual([]);
  });

  it("records structured local logs for no eligible bidders and all-pass rounds", () => {
    const initial = createScenarioAppState();
    const noEligibleState = {
      ...initial,
      game: withGuildTokens(initial.game, {}),
      guild: gatheringGuild(1, initial.game)
    };

    const completed = gameReducer(noEligibleState, { type: "OPEN_AUCTION" });
    expect(completed.guild.gathering.phase).toBe("complete");
    expect(completed.game.log[0]).toMatchObject({
      messageKey: "guild.auctionNoEligibleBidders",
      params: { round: 1 }
    });

    const eligibleState = {
      ...initial,
      game: withGuildTokens(initial.game, { p1: 2 }),
      guild: gatheringGuild()
    };
    const advanced = gameReducer(eligibleState, {
      type: "RESOLVE_AUCTION",
      bids: { p1: 0, p2: 0, p3: 0, p4: 0 }
    });
    expect(advanced.game.log[0]).toMatchObject({
      messageKey: "guild.auctionRoundNoBids",
      params: { round: 1 }
    });
    expect(translate("zh-CN", "guild.auctionNoEligibleBidders")).not.toBe(
      "guild.auctionNoEligibleBidders"
    );
    expect(translate("zh-CN", "guild.auctionRoundNoBids", { round: 1 })).not.toBe(
      "guild.auctionRoundNoBids"
    );
  });
});
