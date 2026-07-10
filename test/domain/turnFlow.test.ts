import { describe, expect, it } from "vitest";
import {
  createInitialAppState,
  unsafeExecuteGameCommandForTests as gameReducer,
  type AppState,
  type GameCommand
} from "../../src/app/gameReducer";
import { placeSetupRoad, placeSetupSettlement } from "../../src/domain/rules/building";
import { createSetupGame } from "../../src/domain/setup";
import { emptyResources, type PlayerId, type ResourceMap } from "../../src/domain/types";

function withPlayerResources(
  state: AppState,
  playerId: PlayerId,
  resources: Partial<ResourceMap>
): AppState {
  return {
    ...state,
    game: {
      ...state.game,
      players: state.game.players.map((player) =>
        player.id === playerId
          ? { ...player, resources: { ...player.resources, ...resources } }
          : player
      )
    }
  };
}

function rollCommand(playerId: PlayerId, dice: [number, number]): GameCommand {
  return { type: "ROLL_DICE", playerId, dice };
}

function endTurnCommand(playerId: PlayerId): GameCommand {
  return { type: "END_TURN", playerId };
}

function futureCommand(command: GameCommand): GameCommand {
  return command;
}

function turnState(state: AppState) {
  return state.game.turnState;
}

function withMultiplePlayerResources(
  state: AppState,
  resourcesByPlayer: Partial<Record<PlayerId, Partial<ResourceMap>>>
): AppState {
  return {
    ...state,
    game: {
      ...state.game,
      players: state.game.players.map((player) => ({
        ...player,
        resources: {
          ...player.resources,
          ...(resourcesByPlayer[player.id] ?? {})
        }
      }))
    }
  };
}

function rollSevenWithTwoDiscarders(): AppState {
  const state = withMultiplePlayerResources(createInitialAppState(), {
    p2: { wood: 4, brick: 4 },
    p3: { grain: 5, ore: 4 }
  });
  return gameReducer(state, rollCommand("p1", [3, 4]));
}

function discardCommand(playerId: PlayerId, resources: Partial<ResourceMap>): GameCommand {
  return futureCommand({
    type: "DISCARD_FOR_SEVEN",
    playerId,
    resources: { ...emptyResources(), ...resources }
  });
}

describe("strict turn flow", () => {
  it("rejects turn-owned actions from a non-active player", () => {
    const state = createInitialAppState();
    const commands: GameCommand[] = [
      rollCommand("p2", [3, 4]),
      endTurnCommand("p2"),
      { type: "BUILD_ROAD", playerId: "p2", edgeId: "any-edge" },
      { type: "BUILD_SETTLEMENT", playerId: "p2", vertexId: "any-vertex" },
      { type: "BUILD_CITY", playerId: "p2", buildingId: "any-building" },
      { type: "BUY_DEVELOPMENT_CARD", playerId: "p2" },
      {
        type: "PLAY_KNIGHT_CARD",
        playerId: "p2",
        cardId: "any-card"
      },
      { type: "MARITIME_TRADE", playerId: "p2", give: "wood", receive: "ore" },
      { type: "COMPLETE_TRADE_SLOT", playerId: "p2", slotId: "wood-contract" },
      { type: "TRANSFER_TOKENS", fromPlayerId: "p2", toPlayerId: "p1", amount: 1 },
      { type: "REDEEM_PRIZE", playerId: "p2" }
    ];

    for (const command of commands) {
      expect(() => gameReducer(state, command), command.type).toThrow(/active player/i);
    }
  });

  it("rejects normal actions before the active player rolls", () => {
    const state = withPlayerResources(createInitialAppState(), "p1", {
      wool: 1,
      grain: 1,
      ore: 1
    });

    expect(() =>
      gameReducer(state, { type: "BUY_DEVELOPMENT_CARD", playerId: "p1" })
    ).toThrow(/roll/i);
  });

  it("rejects ending a turn before the active player rolls", () => {
    const state = createInitialAppState();

    expect(() => gameReducer(state, endTurnCommand("p1"))).toThrow(/roll/i);
  });

  it("allows exactly one dice roll per turn", () => {
    const rolled = gameReducer(createInitialAppState(), rollCommand("p1", [3, 3]));

    expect(rolled.game.turnState.phase).toBe("action");
    expect(() => gameReducer(rolled, rollCommand("p1", [4, 4]))).toThrow(/already rolled/i);
  });

  it("allows normal actions after a non-seven roll", () => {
    const funded = withPlayerResources(createInitialAppState(), "p1", {
      wool: 1,
      grain: 1,
      ore: 1
    });
    const rolled = gameReducer(funded, rollCommand("p1", [3, 3]));

    expect(() =>
      gameReducer(rolled, { type: "BUY_DEVELOPMENT_CARD", playerId: "p1" })
    ).not.toThrow();
  });

  it("resets the next player to a fresh pre-roll turn", () => {
    const rolled = gameReducer(createInitialAppState(), rollCommand("p1", [3, 3]));
    const ended = gameReducer(rolled, endTurnCommand("p1"));

    expect(ended.game.activePlayerId).toBe("p2");
    expect(ended.game.turnState.phase).toBe("awaitingRoll");
    expect(ended.lastDice).toBeNull();
    expect(() => gameReducer(ended, rollCommand("p2", [4, 4]))).not.toThrow();
    expect(() => gameReducer(ended, endTurnCommand("p2"))).toThrow(/roll/i);
  });

  it("starts normal play in awaiting-roll after the final setup road", () => {
    const setup = {
      ...createSetupGame(),
      setup: {
        order: ["p1"],
        placementIndex: 0,
        stage: "settlement" as const
      }
    };
    const vertexId = setup.board[0].vertexIds[0];
    const withSettlement = placeSetupSettlement(setup, "p1", vertexId);
    const edgeId = withSettlement.edges.find((edge) => edge.vertexIds.includes(vertexId))?.id ?? "";

    const playing = placeSetupRoad(withSettlement, "p1", edgeId);

    expect(playing.phase).toBe("playing");
    expect(playing.turnState.phase).toBe("awaitingRoll");
  });

  it("records discard obligations without automatically changing player hands", () => {
    const rolled = rollSevenWithTwoDiscarders();

    expect(turnState(rolled).phase).toBe("awaitingDiscards");
    expect(turnState(rolled).pendingDiscards).toEqual({ p2: 4, p3: 4 });
    expect(rolled.game.players.find((player) => player.id === "p2")?.resources).toMatchObject({
      wood: 4,
      brick: 4
    });
    expect(rolled.game.players.find((player) => player.id === "p3")?.resources).toMatchObject({
      grain: 5,
      ore: 4
    });
  });

  it("validates a chosen discard and returns accepted cards to the bank", () => {
    const rolled = rollSevenWithTwoDiscarders();

    expect(turnState(rolled).phase).toBe("awaitingDiscards");
    expect(() => gameReducer(rolled, discardCommand("p2", { wood: 1 }))).toThrow(/exactly 4/i);
    expect(() =>
      gameReducer(rolled, discardCommand("p2", { wood: 3.5, brick: 0.5 }))
    ).toThrow(/whole/i);

    const discarded = gameReducer(rolled, discardCommand("p2", { wood: 2, brick: 2 }));
    expect(discarded.game.players.find((player) => player.id === "p2")?.resources).toMatchObject({
      wood: 2,
      brick: 2
    });
    expect(discarded.game.bank.resources).toMatchObject({ wood: 21, brick: 21 });
    expect(turnState(discarded).phase).toBe("awaitingDiscards");
    expect(turnState(discarded).pendingDiscards).toEqual({ p3: 4 });
  });

  it("waits for every required discard before requesting robber placement", () => {
    const rolled = rollSevenWithTwoDiscarders();
    expect(turnState(rolled).phase).toBe("awaitingDiscards");
    const afterP2 = gameReducer(rolled, discardCommand("p2", { wood: 2, brick: 2 }));
    const afterP3 = gameReducer(afterP2, discardCommand("p3", { grain: 4 }));

    expect(turnState(afterP3).phase).toBe("awaitingRobberPlacement");
    expect(turnState(afterP3).pendingDiscards).toEqual({});
    expect(turnState(afterP3).pendingRobber).toMatchObject({
      source: "seven",
      resumePhase: "action",
      eligibleVictimIds: []
    });
    expect(afterP3.game.bank.resources.grain).toBe(23);
  });

  it("requires a different robber hex and records eligible victims", () => {
    const state = withMultiplePlayerResources(createInitialAppState(), { p2: { ore: 1 } });
    const rolled = gameReducer(state, rollCommand("p1", [3, 4]));

    expect(turnState(rolled).phase).toBe("awaitingRobberPlacement");
    expect(() =>
      gameReducer(
        rolled,
        futureCommand({ type: "PLACE_ROBBER", playerId: "p1", hexId: "desert" })
      )
    ).toThrow(/different/i);

    const placed = gameReducer(
      rolled,
      futureCommand({ type: "PLACE_ROBBER", playerId: "p1", hexId: "mountain-8" })
    );
    expect(placed.game.robberHexId).toBe("mountain-8");
    expect(turnState(placed).phase).toBe("awaitingRobberVictim");
    expect(turnState(placed).pendingRobber).toMatchObject({
      targetHexId: "mountain-8",
      eligibleVictimIds: ["p2"]
    });
  });

  it("steals one deterministic resource from the selected eligible victim", () => {
    const state = withMultiplePlayerResources(createInitialAppState(), { p2: { ore: 1 } });
    const rolled = gameReducer(state, rollCommand("p1", [3, 4]));
    const placed = gameReducer(
      rolled,
      futureCommand({ type: "PLACE_ROBBER", playerId: "p1", hexId: "mountain-8" })
    );

    expect(() =>
      gameReducer(
        placed,
        futureCommand({
          type: "STEAL_ROBBER_RESOURCE",
          playerId: "p1",
          victimId: "p3",
          random: () => 0
        })
      )
    ).toThrow(/eligible/i);

    const stolen = gameReducer(
      placed,
      futureCommand({
        type: "STEAL_ROBBER_RESOURCE",
        playerId: "p1",
        victimId: "p2",
        random: () => 0
      })
    );
    expect(stolen.game.players.find((player) => player.id === "p1")?.resources.ore).toBe(1);
    expect(stolen.game.players.find((player) => player.id === "p2")?.resources.ore).toBe(0);
    expect(turnState(stolen).phase).toBe("action");
  });

  it("rejects an injected robber random value outside the supported range", () => {
    const state = withMultiplePlayerResources(createInitialAppState(), { p2: { ore: 1 } });
    const rolled = gameReducer(state, rollCommand("p1", [3, 4]));
    const placed = gameReducer(
      rolled,
      futureCommand({ type: "PLACE_ROBBER", playerId: "p1", hexId: "mountain-8" })
    );

    expect(() =>
      gameReducer(
        placed,
        futureCommand({
          type: "STEAL_ROBBER_RESOURCE",
          playerId: "p1",
          victimId: "p2",
          random: () => 1
        })
      )
    ).toThrow(/random/i);
    expect(placed.game.players.find((player) => player.id === "p2")?.resources.ore).toBe(1);
    expect(turnState(placed).phase).toBe("awaitingRobberVictim");
  });

  it("finishes robber placement immediately when no adjacent opponent has resources", () => {
    const rolled = gameReducer(createInitialAppState(), rollCommand("p1", [3, 4]));
    const placed = gameReducer(
      rolled,
      futureCommand({ type: "PLACE_ROBBER", playerId: "p1", hexId: "forest-4" })
    );

    expect(turnState(placed).phase).toBe("action");
    expect(turnState(placed).pendingRobber).toBeUndefined();
  });

  it("uses the staged robber flow and resumes the phase from which a knight was played", () => {
    const initial = createInitialAppState();
    const state = {
      ...initial,
      game: {
        ...initial.game,
        turn: 2,
        players: initial.game.players.map((player) =>
          player.id === "p1"
            ? {
                ...player,
                developmentCards: [
                  {
                    id: "knight-before-roll",
                    kind: "knight" as const,
                    purchasedTurn: 1,
                    revealed: false
                  },
                  {
                    id: "knight-after-roll",
                    kind: "knight" as const,
                    purchasedTurn: 1,
                    revealed: false
                  }
                ]
              }
            : player
        )
      }
    };

    const preRollKnight = gameReducer(
      state,
      futureCommand({ type: "PLAY_KNIGHT_CARD", playerId: "p1", cardId: "knight-before-roll" })
    );
    expect(preRollKnight.game.robberHexId).toBe("desert");
    expect(turnState(preRollKnight).phase).toBe("awaitingRobberPlacement");
    expect(turnState(preRollKnight).pendingRobber).toMatchObject({
      source: "knight",
      resumePhase: "awaitingRoll"
    });

    const afterPreRollRobber = gameReducer(
      preRollKnight,
      futureCommand({ type: "PLACE_ROBBER", playerId: "p1", hexId: "forest-4" })
    );
    expect(turnState(afterPreRollRobber).phase).toBe("awaitingRoll");

    const rolled = gameReducer(state, rollCommand("p1", [3, 3]));
    const postRollKnight = gameReducer(
      rolled,
      futureCommand({ type: "PLAY_KNIGHT_CARD", playerId: "p1", cardId: "knight-after-roll" })
    );
    expect(turnState(postRollKnight).phase).toBe("awaitingRobberPlacement");
    expect(turnState(postRollKnight).pendingRobber).toMatchObject({ resumePhase: "action" });

    const afterPostRollRobber = gameReducer(
      postRollKnight,
      futureCommand({ type: "PLACE_ROBBER", playerId: "p1", hexId: "field-6" })
    );
    expect(turnState(afterPostRollRobber).phase).toBe("action");
  });
});
