import { describe, expect, it } from "vitest";
import {
  completeTradeSlot,
  createCommerceGuild,
  redeemGatheringResources,
  resolveAuctionRound,
  startGuildGathering,
  transferGuildTokens,
  type CommerceGuildState
} from "../../src/domain/expansion/commerceGuild";
import { createScenarioGame } from "../fixtures/createScenarioGame";
import { resources, type GameState, type Player, type PlayerId, type Resource } from "../../src/domain/types";

function withPlayer(game: GameState, playerId: PlayerId, update: (player: Player) => Player): GameState {
  return {
    ...game,
    players: game.players.map((player) => (player.id === playerId ? update(player) : player))
  };
}

function resourceTotal(game: GameState, resource: Resource): number {
  return (
    game.bank.resources[resource] +
    game.players.reduce((total, player) => total + player.resources[resource], 0)
  );
}

function resultPlayerResource(game: GameState, playerId: PlayerId, resource: Resource): number {
  return game.players.find((player) => player.id === playerId)?.resources[resource] ?? 0;
}

function auctionGuild(): CommerceGuildState {
  const gathering = startGuildGathering(createCommerceGuild());
  return {
    ...gathering,
    gathering: {
      ...gathering.gathering,
      phase: "auction"
    }
  };
}

function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

describe("Commerce Guild resource integrity", () => {
  it("returns every kind of completed trade-slot resource to the bank", () => {
    for (const resource of resources) {
      const game = withPlayer(createScenarioGame(), "p1", (player) => ({
        ...player,
        resources: { ...player.resources, [resource]: 2 }
      }));
      const guild = createCommerceGuild([
        { id: "target", requires: { [resource]: 2 }, tokenReward: 2 },
        { id: "aux-brick", requires: { brick: 1 }, tokenReward: 1 },
        { id: "aux-ore", requires: { ore: 1 }, tokenReward: 1 }
      ]);
      const beforeBank = game.bank.resources[resource];
      const beforeTotal = resourceTotal(game, resource);

      const result = completeTradeSlot(game, guild, "p1", "target");

      expect(result.game.bank.resources[resource]).toBe(beforeBank + 2);
      expect(result.game.players.find((player) => player.id === "p1")?.resources[resource]).toBe(0);
      expect(resourceTotal(result.game, resource)).toBe(beforeTotal);
    }
  });

  it("transfers every kind of gathering redemption from the bank and rejects unavailable stock atomically", () => {
    for (const resource of resources) {
      const game = withPlayer(
        {
          ...createScenarioGame(),
          bank: { resources: { ...createScenarioGame().bank.resources, [resource]: 1 } }
        },
        "p1",
        (player) => ({ ...player, guildTokens: 2 })
      );
      const guild = startGuildGathering(createCommerceGuild());

      const redeemed = redeemGatheringResources(game, guild, "p1", { [resource]: 1 });
      expect(redeemed.game.bank.resources[resource]).toBe(0);
      expect(resultPlayerResource(redeemed.game, "p1", resource)).toBe(1);
      expect(resourceTotal(redeemed.game, resource)).toBe(resourceTotal(game, resource));

      const beforeRejectedGame = structuredClone(redeemed.game);
      const beforeRejectedGuild = structuredClone(redeemed.guild);
      expect(() =>
        redeemGatheringResources(redeemed.game, redeemed.guild, "p1", { [resource]: 1 })
      ).toThrow(/bank|stock/i);
      expect(redeemed.game).toEqual(beforeRejectedGame);
      expect(redeemed.guild).toEqual(beforeRejectedGuild);
    }
  });

  it("caps resource blind boxes by bank stock and reports the actual award", () => {
    const game = withPlayer(
      {
        ...createScenarioGame(),
        bank: { resources: { ...createScenarioGame().bank.resources, wood: 1 } }
      },
      "p2",
      (player) => ({ ...player, guildTokens: 2 })
    );
    const beforeTotal = resourceTotal(game, "wood");

    const result = resolveAuctionRound(
      game,
      auctionGuild(),
      { p2: 1 },
      sequenceRandom([0.1, 0, 0, 0])
    );

    expect(result.kind).toBe("won");
    if (result.kind !== "won") throw new Error("Expected a winning auction result.");
    expect(result.outcome).toMatchObject({
      kind: "resources",
      resources: { wood: 1 }
    });
    expect(result.game.bank.resources.wood).toBe(0);
    expect(result.game.players.find((player) => player.id === "p2")?.resources.wood).toBe(1);
    expect(resourceTotal(result.game, "wood")).toBe(beforeTotal);
    expect(result.summary).toContain("wood 1");
    expect(result.summary).not.toContain("wood 2");
  });

  it("caps every resource independently and preserves its total", () => {
    for (const [resourceIndex, resource] of resources.entries()) {
      const game = withPlayer(
        {
          ...createScenarioGame(),
          bank: {
            resources: { ...createScenarioGame().bank.resources, [resource]: 1 }
          }
        },
        "p2",
        (player) => ({ ...player, guildTokens: 2 })
      );
      const beforeTotal = resourceTotal(game, resource);
      const resourceRoll = (resourceIndex + 0.1) / resources.length;

      const result = resolveAuctionRound(
        game,
        auctionGuild(),
        { p2: 1 },
        sequenceRandom([0.1, 0, resourceRoll, resourceRoll])
      );

      expect(result.kind).toBe("won");
      if (result.kind !== "won") throw new Error("Expected a winning auction result.");
      expect(result.outcome).toMatchObject({
        kind: "resources",
        resources: { [resource]: 1 }
      });
      expect(result.game.bank.resources[resource]).toBe(0);
      expect(resourceTotal(result.game, resource)).toBe(beforeTotal);
    }
  });

  it("reports an explicit zero award when the bank fully truncates a resource blind box", () => {
    const game = withPlayer(
      {
        ...createScenarioGame(),
        bank: {
          resources: { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 }
        }
      },
      "p2",
      (player) => ({ ...player, guildTokens: 2 })
    );

    const result = resolveAuctionRound(
      game,
      auctionGuild(),
      { p2: 1 },
      sequenceRandom([0.1, 0, 0, 0])
    );

    expect(result.summary).toContain("no resources");
  });

  it("rejects redemption when no positive transfer is possible", () => {
    const noTokensGame = createScenarioGame();
    const guild = startGuildGathering(createCommerceGuild());
    expect(() => redeemGatheringResources(noTokensGame, guild, "p1", { wood: 1 })).toThrow(
      /token/i
    );

    const cappedGame = withPlayer(noTokensGame, "p1", (player) => ({ ...player, guildTokens: 1 }));
    const cappedGuild = {
      ...guild,
      gathering: {
        ...guild.gathering,
        redemptions: { p1: 4 }
      }
    };
    expect(() => redeemGatheringResources(cappedGame, cappedGuild, "p1", { wood: 1 })).toThrow(
      /cap/i
    );
  });

  it("rejects invalid blind-box random samples before charging or rewarding", () => {
    const game = withPlayer(createScenarioGame(), "p2", (player) => ({ ...player, guildTokens: 2 }));
    const guild = auctionGuild();
    const beforeGame = structuredClone(game);
    const beforeGuild = structuredClone(guild);

    for (const randomValue of [-0.1, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveAuctionRound(game, guild, { p2: 1 }, () => randomValue)).toThrow(
        /random/i
      );
    }
    expect(() =>
      resolveAuctionRound(game, guild, { p2: 1 }, sequenceRandom([0.1, 1]))
    ).toThrow(/random/i);
    expect(game).toEqual(beforeGame);
    expect(guild).toEqual(beforeGuild);
  });

  it("rejects fractional and non-finite token, redemption, and auction quantities", () => {
    const game = withPlayer(createScenarioGame(), "p1", (player) => ({
      ...player,
      guildTokens: 4
    }));
    const redemptionGuild = startGuildGathering(createCommerceGuild());
    const auctionState = auctionGuild();
    const beforeGame = structuredClone(game);
    const beforeRedemptionGuild = structuredClone(redemptionGuild);
    const beforeAuctionGuild = structuredClone(auctionState);

    for (const amount of [-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => transferGuildTokens(game, "p1", "p2", amount)).toThrow(/finite|whole/i);
    }
    for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        redeemGatheringResources(game, redemptionGuild, "p1", { wood: amount })
      ).toThrow(/finite|whole/i);
      expect(() =>
        resolveAuctionRound(game, auctionState, { p1: amount }, () => 0.6)
      ).toThrow(/finite|whole/i);
    }
    expect(() => redeemGatheringResources(game, redemptionGuild, "p1", {})).toThrow(/resource/i);
    const passedAuction = resolveAuctionRound(game, auctionState, { p1: 0 }, () => 0.6);
    expect(passedAuction.kind).toBe("noBid");
    expect(passedAuction.guild.gathering.auctionRound).toBe(2);

    const richGame = withPlayer(game, "p1", (player) => ({
      ...player,
      resources: { ...player.resources, wood: 4 }
    }));
    const fractionalCostGuild = createCommerceGuild([
      { id: "bad-cost", requires: { wood: 1.5 }, tokenReward: 1 },
      { id: "brick", requires: { brick: 1 }, tokenReward: 1 },
      { id: "ore", requires: { ore: 1 }, tokenReward: 1 }
    ]);
    const fractionalRewardGuild = createCommerceGuild([
      { id: "bad-reward", requires: { wood: 1 }, tokenReward: 1.5 },
      { id: "brick", requires: { brick: 1 }, tokenReward: 1 },
      { id: "ore", requires: { ore: 1 }, tokenReward: 1 }
    ]);
    expect(() => completeTradeSlot(richGame, fractionalCostGuild, "p1", "bad-cost")).toThrow(
      /whole/i
    );
    expect(() =>
      completeTradeSlot(richGame, fractionalRewardGuild, "p1", "bad-reward")
    ).toThrow(/whole/i);
    expect(game).toEqual(beforeGame);
    expect(redemptionGuild).toEqual(beforeRedemptionGuild);
    expect(auctionState).toEqual(beforeAuctionGuild);
  });
});
