import { describe, expect, it } from "vitest";
import { gameReducer } from "../../src/app/gameReducer";
import { getLegalRoadEdgeIds } from "../../src/domain/rules/building";
import { executeMatchCommandForTest } from "./matchCommandTestUtils";
import { createScenarioAppState } from "../fixtures/createScenarioGame";

describe("frontend command recovery", () => {
  it("preserves application data and exposes a notice when a command is rejected", () => {
    const initial = createScenarioAppState();
    const actionState = executeMatchCommandForTest(initial, {
      type: "ROLL_DICE",
      playerId: initial.game.activePlayerId,
      dice: [1, 1]
    });
    const edgeId = getLegalRoadEdgeIds(actionState.game, actionState.game.activePlayerId)[0];

    expect(edgeId).toBeDefined();

    const rejected = gameReducer(actionState, {
      type: "BUILD_ROAD",
      playerId: actionState.game.activePlayerId,
      edgeId
    });

    expect(rejected.game).toBe(actionState.game);
    expect(rejected.guild).toBe(actionState.guild);
    expect(rejected.lastDice).toBe(actionState.lastDice);
    expect(rejected.notice).toMatch(/cannot afford/i);
  });

  it("clears an earlier notice after a successful command", () => {
    const initial = createScenarioAppState();
    const actionState = executeMatchCommandForTest(initial, {
      type: "ROLL_DICE",
      playerId: initial.game.activePlayerId,
      dice: [1, 1]
    });
    const edgeId = getLegalRoadEdgeIds(actionState.game, actionState.game.activePlayerId)[0];
    const rejected = gameReducer(actionState, {
      type: "BUILD_ROAD",
      playerId: actionState.game.activePlayerId,
      edgeId
    });

    const nextTurn = gameReducer(rejected, {
      type: "END_TURN",
      playerId: rejected.game.activePlayerId
    });

    expect(nextTurn.notice).toBeNull();
    expect(nextTurn.game.activePlayerId).not.toBe(rejected.game.activePlayerId);
  });

  it("rethrows unexpected implementation faults instead of presenting them as rule notices", () => {
    const initial = createScenarioAppState();
    const actionState = executeMatchCommandForTest(initial, {
      type: "ROLL_DICE",
      playerId: initial.game.activePlayerId,
      dice: [1, 1]
    });
    const edgeId = getLegalRoadEdgeIds(actionState.game, actionState.game.activePlayerId)[0];
    const malformed = {
      ...actionState,
      game: {
        ...actionState.game,
        players: actionState.game.players.map((player) =>
          player.id === actionState.game.activePlayerId
            ? { ...player, resources: undefined }
            : player
        )
      }
    } as unknown as typeof initial;

    expect(() =>
      gameReducer(malformed, {
        type: "BUILD_ROAD",
        playerId: malformed.game.activePlayerId,
        edgeId: edgeId!
      })
    ).toThrow(TypeError);
  });
});
