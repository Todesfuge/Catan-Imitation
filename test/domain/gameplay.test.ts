import { describe, expect, it } from "vitest";
import { gameReducer, createInitialAppState } from "../../src/app/gameReducer";
import { buildCity, buildRoad, buildSettlement } from "../../src/domain/rules/building";
import { calculatePlayerScore } from "../../src/domain/rules/scoring";

describe("core gameplay rules", () => {
  it("builds roads, settlements, and cities by paying the configured costs", () => {
    const state = createInitialAppState();
    const richGame = {
      ...state.game,
      players: state.game.players.map((player) =>
        player.id === "p1"
          ? {
              ...player,
              resources: { wood: 3, brick: 3, wool: 1, grain: 3, ore: 3 }
            }
          : player
      )
    };

    const roadGame = buildRoad(richGame, "p1", "pasture-8-e0");
    const settlementGame = buildSettlement(roadGame, "p1", "forest-4-v0");
    const cityGame = buildCity(settlementGame, "p1", "built-settlement-p1-forest-4-v0");
    const p1 = cityGame.players.find((player) => player.id === "p1");

    expect(cityGame.roads.some((road) => road.edgeId === "pasture-8-e0")).toBe(true);
    expect(cityGame.buildings.find((building) => building.vertexId === "forest-4-v0")?.kind).toBe(
      "city"
    );
    expect(p1?.resources).toMatchObject({ wood: 1, brick: 1, wool: 0, grain: 0, ore: 0 });
    expect(cityGame.bank.resources).toMatchObject({
      wood: 21,
      brick: 21,
      wool: 20,
      grain: 22,
      ore: 22
    });
  });

  it("counts settlements, cities, and commerce prize cards toward score", () => {
    const state = createInitialAppState();
    const game = {
      ...state.game,
      players: state.game.players.map((player) =>
        player.id === "p1" ? { ...player, prizeCards: 2 } : player
      )
    };

    expect(calculatePlayerScore(game, "p1")).toBe(6);
  });

  it("roll dice command applies production to player hands and records the roll", () => {
    const state = createInitialAppState();

    const next = gameReducer(state, { type: "ROLL_DICE", dice: [4, 4] });
    const p1 = next.game.players.find((player) => player.id === "p1");
    const p2 = next.game.players.find((player) => player.id === "p2");

    expect(next.lastDice?.total).toBe(8);
    expect(p1?.resources.wool).toBe(2);
    expect(p2?.resources.ore).toBe(1);
    expect(next.game.log[0].message).toContain("rolled 8");
  });
});
