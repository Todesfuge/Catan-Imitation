import { describe, expect, it } from "vitest";
import { getActionAvailability } from "../../src/app/actionAvailability";
import { createInitialAppState, gameReducer } from "../../src/app/gameReducer";
import { emptyResources, type ResourceMap } from "../../src/domain/types";

function withActiveResources(resources: Partial<ResourceMap>) {
  const state = createInitialAppState();
  return {
    ...state,
    game: {
      ...state.game,
      players: state.game.players.map((player) =>
        player.id === state.game.activePlayerId
          ? { ...player, resources: { ...emptyResources(), ...resources } }
          : player
      )
    }
  };
}

function enterActionPhase(resources: Partial<ResourceMap> = {}) {
  const state = withActiveResources(resources);
  return gameReducer(state, {
    type: "ROLL_DICE",
    playerId: state.game.activePlayerId,
    dice: [1, 1]
  });
}

describe("turn action availability", () => {
  it("disables unaffordable builds while preserving a useful reason", () => {
    const state = enterActionPhase();
    const actions = getActionAvailability(state, state.game.activePlayerId);

    expect(actions.road.enabled).toBe(false);
    expect(actions.road.reason).toMatch(/wood|brick|afford/i);
    expect(actions.settlement.enabled).toBe(false);
    expect(actions.settlement.reason).toMatch(/wood|brick|wool|grain|afford/i);
  });

  it("returns every legal paid build target for an affordable active player", () => {
    const state = enterActionPhase({ wood: 2, brick: 2, wool: 1, grain: 3, ore: 3 });
    const game = { ...state.game, buildings: [] };
    const actions = getActionAvailability({ ...state, game }, game.activePlayerId);

    expect(actions.road.enabled).toBe(true);
    expect(actions.road.targets.length).toBeGreaterThan(0);
    expect(actions.settlement.targets.length).toBeGreaterThan(0);
    expect(actions.city.targets).toEqual([]);
  });

  it("returns explicit maritime give choices with legal receive resources", () => {
    const state = enterActionPhase({ wood: 4 });
    const actions = getActionAvailability(state, state.game.activePlayerId);
    const woodTrade = actions.maritime.trades.find((trade) => trade.give === "wood");

    expect(actions.maritime.enabled).toBe(true);
    expect(woodTrade?.ratio).toBe(4);
    expect(woodTrade?.receives).toEqual(["brick", "wool", "grain", "ore"]);
  });

  it("rejects inactive players and centralizes non-build and Commerce availability", () => {
    const actionState = enterActionPhase();
    const inactive = getActionAvailability(actionState, "p2");

    expect(inactive.roll.enabled).toBe(false);
    expect(inactive.endTurn.enabled).toBe(false);
    expect(inactive.buyDevelopmentCard.enabled).toBe(false);
    expect(inactive.maritime.enabled).toBe(false);
    expect(inactive.commerce.transfer.enabled).toBe(false);

    const funded = {
      ...actionState,
      game: {
        ...actionState.game,
        players: actionState.game.players.map((player) =>
          player.id === actionState.game.activePlayerId
            ? { ...player, guildTokens: 2, vouchers: 2 }
            : player
        )
      }
    };
    const active = getActionAvailability(funded, funded.game.activePlayerId);

    expect(active.endTurn.enabled).toBe(true);
    expect(active.commerce.transfer.enabled).toBe(true);
    expect(active.commerce.transfer.maxAmount).toBe(2);
    expect(active.commerce.redeemPrize.enabled).toBe(false);
    expect(active.commerce.gatheringPlayers[0].remainingAllowance).toBe(4);
  });
});
