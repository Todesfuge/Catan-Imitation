import { describe, expect, it } from "vitest";
import { createInitialAppState, gameReducer } from "../../src/app/gameReducer";
import {
  createCommerceGuild,
  resolveAuctionRound,
  startGuildGathering,
  transferGuildTokens
} from "../../src/domain/expansion/commerceGuild";
import { createDemoGame } from "../../src/domain/setup";
import { createDevelopmentDeck } from "../../src/domain/rules/developmentCards";
import type { GameState, Player } from "../../src/domain/types";

function withPlayer(game: GameState, playerId: string, update: (player: Player) => Player): GameState {
  return {
    ...game,
    players: game.players.map((player) => (player.id === playerId ? update(player) : player))
  };
}

describe("Commerce Guild polish", () => {
  it("auto-starts a gathering after every six completed rounds and not before", () => {
    const state = createInitialAppState();
    const beforeInterval = {
      ...state,
      game: {
        ...state.game,
        activePlayerId: "p4",
        round: 5
      }
    };

    const stillIdle = gameReducer(beforeInterval, { type: "END_TURN" });
    expect(stillIdle.game.round).toBe(6);
    expect(stillIdle.guild.gathering.phase).toBe("idle");

    const intervalBoundary = {
      ...stillIdle,
      game: {
        ...stillIdle.game,
        activePlayerId: "p4",
        round: 6
      }
    };
    const triggered = gameReducer(intervalBoundary, { type: "END_TURN" });

    expect(triggered.game.round).toBe(7);
    expect(triggered.guild.gathering.phase).toBe("redemption");
    expect(triggered.game.log[0].message).toContain("Commerce Guild gathering");
  });

  it("rejects invalid auction bids with player names and records a visible result summary", () => {
    const game = {
      ...createDemoGame(),
      activePlayerId: "p2",
      players: createDemoGame().players.map((player) => ({
        ...player,
        guildTokens: player.id === "p2" ? 4 : 0
      }))
    };
    const guild = {
      ...startGuildGathering(createCommerceGuild()),
      gathering: {
        ...startGuildGathering(createCommerceGuild()).gathering,
        phase: "auction" as const
      }
    };

    expect(() => resolveAuctionRound(game, guild, { p2: 5 })).toThrow(/Loss.*exceeds/i);

    const result = resolveAuctionRound(game, guild, { p2: 3 }, () => 0.6);

    expect(result.summary).toContain("Loss won auction round 1 with 3 token");
    expect(result.summary).toContain("voucher");
    expect(result.guild.gathering.lastAuctionSummary).toBe(result.summary);
  });

  it("draws Commerce Guild development-card rewards from the real deck and rejects empty decks", () => {
    const game = withPlayer(
      {
        ...createDemoGame(),
        developmentDeck: createDevelopmentDeck(["monopoly", "knight"])
      },
      "p2",
      (player) => ({ ...player, guildTokens: 4 })
    );
    const guild = {
      ...startGuildGathering(createCommerceGuild()),
      gathering: {
        ...startGuildGathering(createCommerceGuild()).gathering,
        phase: "auction" as const
      }
    };

    const result = resolveAuctionRound(game, guild, { p2: 2 }, () => 0.9);
    const p2 = result.game.players.find((player) => player.id === "p2");

    expect(result.outcome).toMatchObject({ kind: "developmentCard", card: "monopoly" });
    expect(result.game.developmentDeck.map((card) => card.kind)).toEqual(["knight"]);
    expect(p2?.developmentCards.map((card) => card.kind)).toEqual(["monopoly"]);
    expect(() =>
      resolveAuctionRound({ ...game, developmentDeck: [] }, guild, { p2: 2 }, () => 0.9)
    ).toThrow(/development card deck is empty/i);
  });

  it("uses display names in token transfer logs and rejects self transfers", () => {
    const state = {
      ...createInitialAppState(),
      game: withPlayer(createInitialAppState().game, "p1", (player) => ({
        ...player,
        guildTokens: 3
      }))
    };

    const transferred = gameReducer(state, {
      type: "TRANSFER_TOKENS",
      fromPlayerId: "p1",
      toPlayerId: "p2",
      amount: 2
    });

    expect(transferred.game.log[0].message).toContain("Voyage1969 transferred 2 guild token");
    expect(transferred.game.log[0].message).toContain("Loss");
    expect(transferred.game.log[0].message).not.toContain("p1 transferred");
    expect(() => transferGuildTokens(state.game, "p1", "p1", 1)).toThrow(/different players/i);
  });
});
