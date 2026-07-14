import { describe, expect, it } from "vitest";
import { createScenarioGame } from "../fixtures/createScenarioGame";
import {
  completeTradeSlot,
  createCommerceGuild,
  redeemGatheringResources,
  redeemPrizeCards,
  resolveAuctionRound,
  startGuildGathering,
  transferGuildTokens
} from "../../src/domain/expansion/commerceGuild";
import type { GameState, ResourceMap } from "../../src/domain/types";

function withPlayerResources(game: GameState, playerId: string, resources: Partial<ResourceMap>) {
  return {
    ...game,
    players: game.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            resources: { ...player.resources, ...resources }
          }
        : player
    )
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

describe("Commerce Guild", () => {
  it("starts with three trade slots and refreshes a used slot after a once-per-turn trade", () => {
    const game = withPlayerResources(createScenarioGame(), "p1", { wood: 2, brick: 1 });
    const guild = createCommerceGuild(game.players.length, game.turn, [
      { id: "slot-a", requires: { wood: 2 }, tokenReward: 3 },
      { id: "slot-b", requires: { brick: 1 }, tokenReward: 1 },
      { id: "slot-c", requires: { grain: 1 }, tokenReward: 2 }
    ]);

    const first = completeTradeSlot(game, guild, "p1", "slot-a", {
      id: "slot-d",
      requires: { ore: 1 },
      tokenReward: 2
    });

    expect(first.game.players.find((player) => player.id === "p1")?.resources.wood).toBe(0);
    expect(first.game.players.find((player) => player.id === "p1")?.guildTokens).toBe(3);
    expect(first.guild.tradeSlots.map((slot) => slot.id)).toEqual(["slot-d", "slot-b", "slot-c"]);
    expect(() => completeTradeSlot(first.game, first.guild, "p1", "slot-b")).toThrow(
      /once per turn/
    );
  });

  it("transfers tokens and caps guild gathering resource redemption at four per player", () => {
    const game = {
      ...createScenarioGame(),
      players: createScenarioGame().players.map((player) =>
        player.id === "p1" ? { ...player, guildTokens: 6 } : player
      )
    };
    const guild = gatheringGuild(game);

    const transferred = transferGuildTokens(game, "p1", "p2", 2);
    const redeemed = redeemGatheringResources(transferred, guild, "p1", {
      wood: 1,
      brick: 1,
      wool: 1,
      grain: 1,
      ore: 1
    });

    const p1 = redeemed.game.players.find((player) => player.id === "p1");
    const p2 = transferred.players.find((player) => player.id === "p2");

    expect(p2?.guildTokens).toBe(2);
    expect(p1?.guildTokens).toBe(0);
    expect(p1?.resources).toMatchObject({ wood: 1, brick: 1, wool: 1, grain: 1, ore: 0 });
    expect(redeemed.guild.gathering.redemptions.p1).toBe(4);
  });

  it("resolves auctions by active turn-order ties and redeems three vouchers into a prize card", () => {
    const game = {
      ...createScenarioGame(),
      activePlayerId: "p2",
      players: createScenarioGame().players.map((player) => ({
        ...player,
        guildTokens: player.id === "p2" || player.id === "p3" ? 4 : 0,
        vouchers: player.id === "p2" ? 2 : 0
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

    const resolved = resolveAuctionRound(game, guild, { p2: 3, p3: 3 }, () => 0.6);
    const redeemed = redeemPrizeCards(resolved.game, "p2");
    const p2 = redeemed.players.find((player) => player.id === "p2");

    expect(resolved.kind).toBe("won");
    if (resolved.kind !== "won") throw new Error("Expected a winning auction result.");
    expect(resolved.winnerId).toBe("p2");
    expect(resolved.outcome.kind).toBe("voucher");
    expect(resolved.guild.gathering.auctionRound).toBe(2);
    expect(p2?.guildTokens).toBe(1);
    expect(p2?.vouchers).toBe(0);
    expect(p2?.prizeCards).toBe(1);
  });
});

