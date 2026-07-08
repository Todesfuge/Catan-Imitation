import { describe, expect, it } from "vitest";
import { gameReducer, createInitialAppState } from "../../src/app/gameReducer";
import { createSetupGame } from "../../src/domain/setup";
import {
  applyProduction,
  resolveSevenRoll
} from "../../src/domain/rules/production";
import {
  buildRoad,
  buildSettlement,
  placeSetupRoad,
  placeSetupSettlement
} from "../../src/domain/rules/building";
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

describe("post-MVP core Catan rules", () => {
  it("runs setup in settlement-road pairs using snake player order before normal play", () => {
    let game = createSetupGame();

    expect(game.phase).toBe("setup");
    expect(game.activePlayerId).toBe("p1");

    game = placeSetupSettlement(game, "p1", "forest-4-v0");
    expect(game.setup?.stage).toBe("road");
    expect(game.activePlayerId).toBe("p1");

    game = placeSetupRoad(game, "p1", "forest-4-e0");
    expect(game.setup?.stage).toBe("settlement");
    expect(game.activePlayerId).toBe("p2");

    for (const [playerId, vertexId, edgeId] of [
      ["p2", "mountain-8-v0", "mountain-8-e0"],
      ["p3", "pasture-5-v0", "pasture-5-e0"],
      ["p4", "field-11-a-v0", "field-11-a-e0"],
      ["p4", "field-3-v0", "field-3-e0"],
      ["p3", "mountain-10-v0", "mountain-10-e0"],
      ["p2", "pasture-2-v0", "pasture-2-e0"],
      ["p1", "forest-12-v0", "forest-12-e0"]
    ] as const) {
      game = placeSetupSettlement(game, playerId, vertexId);
      game = placeSetupRoad(game, playerId, edgeId);
    }

    expect(game.phase).toBe("playing");
    expect(game.setup).toBeUndefined();
    expect(game.activePlayerId).toBe("p1");
  });

  it("blocks normal dice rolls during setup", () => {
    const state = {
      ...createInitialAppState(),
      game: createSetupGame()
    };

    expect(() => gameReducer(state, { type: "ROLL_DICE", dice: [3, 4] })).toThrow(/setup/i);
  });

  it("rejects occupied and adjacent settlement vertices", () => {
    const game = withPlayerResources(createSetupGame(), "p1", {
      wood: 4,
      brick: 4,
      wool: 4,
      grain: 4
    });
    const withSettlement = buildSettlement(
      { ...game, phase: "playing", setup: undefined },
      "p1",
      "forest-4-v0"
    );

    expect(() => buildSettlement(withSettlement, "p2", "forest-4-v0")).toThrow(/occupied/i);
    expect(() => buildSettlement(withSettlement, "p2", "forest-4-v1")).toThrow(/distance/i);
  });

  it("requires roads to use valid edges and connect to owned pieces", () => {
    const game = withPlayerResources(createSetupGame(), "p1", {
      wood: 4,
      brick: 4,
      wool: 4,
      grain: 4
    });
    const playingGame = buildSettlement(
      { ...game, phase: "playing", setup: undefined },
      "p1",
      "forest-4-v0"
    );

    expect(() => buildRoad(playingGame, "p1", "desert-e3")).toThrow(/connect/i);

    const withRoad = buildRoad(playingGame, "p1", "forest-4-e0");
    expect(withRoad.roads.some((road) => road.edgeId === "forest-4-e0")).toBe(true);
    expect(() => buildRoad(withRoad, "p2", "forest-4-e0")).toThrow(/occupied/i);
  });

  it("updates bank resources during production and caps payout when the bank is short", () => {
    const game = {
      ...createInitialAppState().game,
      bank: { resources: { wood: 19, brick: 19, wool: 1, grain: 19, ore: 19 } }
    };

    const result = applyProduction(game, 8);
    const p1 = result.game.players.find((player) => player.id === "p1");
    const p2 = result.game.players.find((player) => player.id === "p2");

    expect(p1?.resources.wool).toBe(1);
    expect(p2?.resources.ore).toBe(1);
    expect(result.game.bank.resources.wool).toBe(0);
    expect(result.game.bank.resources.ore).toBe(18);
  });

  it("rolling 7 discards over-limit hands, moves the robber, and steals from an adjacent opponent", () => {
    const richGame = {
      ...createInitialAppState().game,
      activePlayerId: "p1",
      players: createInitialAppState().game.players.map((player) =>
        player.id === "p2"
          ? {
              ...player,
              resources: { wood: 4, brick: 4, wool: 2, grain: 0, ore: 0 }
            }
          : player
      )
    };

    const result = resolveSevenRoll(richGame, "mountain-8", "p2", () => 0);
    const p1 = result.players.find((player) => player.id === "p1");
    const p2 = result.players.find((player) => player.id === "p2");

    expect(result.robberHexId).toBe("mountain-8");
    expect(Object.values(p2?.resources ?? {}).reduce((sum, count) => sum + count, 0)).toBe(4);
    expect(p1?.resources.wool).toBe(1);

    const noStealResult = resolveSevenRoll(richGame, "mountain-8");
    const noStealP1 = noStealResult.players.find((player) => player.id === "p1");
    const noStealP2 = noStealResult.players.find((player) => player.id === "p2");

    expect(noStealResult.robberHexId).toBe("mountain-8");
    expect(Object.values(noStealP2?.resources ?? {}).reduce((sum, count) => sum + count, 0)).toBe(
      5
    );
    expect(noStealP1?.resources.wool).toBe(0);
  });

  it("enters game-over state when the active player reaches the target score", () => {
    const state = {
      ...createInitialAppState(),
      game: {
        ...createInitialAppState().game,
        targetScore: 2
      }
    };

    const next = gameReducer(state, { type: "ROLL_DICE", dice: [4, 4] });

    expect(next.game.phase).toBe("gameOver");
    expect(next.game.winnerId).toBe("p1");
    expect(() => gameReducer(next, { type: "END_TURN" })).toThrow(/over/i);
  });
});
