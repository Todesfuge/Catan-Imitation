import { describe, expect, it } from "vitest";
import { gameReducer } from "../../src/app/gameReducer";
import {
  createCommerceGuild,
  resolveAuctionRound,
  startGuildGathering,
  transferGuildTokens
} from "../../src/domain/expansion/commerceGuild";
import {
  createScenarioAppState,
  createScenarioGame
} from "../fixtures/createScenarioGame";
import { createDevelopmentDeck } from "../../src/domain/rules/developmentCards";
import type { GameState, Player } from "../../src/domain/types";

function withPlayer(game: GameState, playerId: string, update: (player: Player) => Player): GameState {
  return {
    ...game,
    players: game.players.map((player) => (player.id === playerId ? update(player) : player))
  };
}

function gatheringGuild(game: GameState) {
  const actionGame = {
    ...game,
    turnState: { phase: "action" as const, pendingDiscards: {} }
  };
  const guild = createCommerceGuild(game.players.length, game.turn);
  return startGuildGathering(actionGame, {
    ...guild,
    gatheringCooldown: { availableAtTurn: game.turn, displayDuration: game.players.length }
  }, game.activePlayerId, false);
}

describe("Commerce Guild polish", () => {
  it("does not auto-start a gathering at the former six-round boundary", () => {
    const state = createScenarioAppState();
    const beforeInterval = {
      ...state,
      game: {
        ...state.game,
        activePlayerId: "p4",
        round: 5,
        turnState: { phase: "action" as const, pendingDiscards: {} }
      }
    };

    const stillIdle = gameReducer(beforeInterval, { type: "END_TURN", playerId: "p4" });
    expect(stillIdle.game.round).toBe(6);
    expect(stillIdle.guild.gathering.phase).toBe("idle");

    const intervalBoundary = {
      ...stillIdle,
      game: {
        ...stillIdle.game,
        activePlayerId: "p4",
        round: 6,
        turnState: { phase: "action" as const, pendingDiscards: {} }
      }
    };
    const triggered = gameReducer(intervalBoundary, { type: "END_TURN", playerId: "p4" });

    expect(triggered.game.round).toBe(7);
    expect(triggered.guild.gathering.phase).toBe("idle");
  });

  it("rejects invalid auction bids with player names and records a visible result summary", () => {
    const game = {
      ...createScenarioGame(),
      activePlayerId: "p2",
      players: createScenarioGame().players.map((player) => ({
        ...player,
        guildTokens: player.id === "p2" ? 4 : 0
      }))
    };
    const gathering = gatheringGuild(game);
    const guild = {
      ...gathering,
      gathering: {
        ...gathering.gathering,
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
        ...createScenarioGame(),
        developmentDeck: createDevelopmentDeck(["monopoly", "knight"])
      },
      "p2",
      (player) => ({ ...player, guildTokens: 4 })
    );
    const gathering = gatheringGuild(game);
    const guild = {
      ...gathering,
      gathering: {
        ...gathering.gathering,
        phase: "auction" as const
      }
    };

    const result = resolveAuctionRound(game, guild, { p2: 2 }, () => 0.9);
    const p2 = result.game.players.find((player) => player.id === "p2");

    expect(result.kind).toBe("won");
    if (result.kind !== "won") throw new Error("Expected a winning auction result.");
    expect(result.outcome).toMatchObject({ kind: "developmentCard", card: "monopoly" });
    expect(result.game.developmentDeck.map((card) => card.kind)).toEqual(["knight"]);
    expect(p2?.developmentCards.map((card) => card.kind)).toEqual(["monopoly"]);
    expect(() =>
      resolveAuctionRound({ ...game, developmentDeck: [] }, guild, { p2: 2 }, () => 0.9)
    ).toThrow(/development card deck is empty/i);
  });

  it("uses display names in token transfer logs and rejects self transfers", () => {
    const state = {
      ...createScenarioAppState(),
      game: {
        ...withPlayer(createScenarioAppState().game, "p1", (player) => ({
          ...player,
          guildTokens: 3
        })),
        turnState: { phase: "action" as const, pendingDiscards: {} }
      }
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
