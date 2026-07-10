import { describe, expect, it } from "vitest";
import {
  createInitialAppState,
  gameReducer,
  unsafeExecuteGameCommandForTests,
  type AppState
} from "../../src/app/gameReducer";
import {
  acceptPlayerTrade,
  createPlayerTradeOffer
} from "../../src/domain/rules/playerTrade";
import { emptyResources, resources, type ResourceMap } from "../../src/domain/types";

function bundle(values: Partial<ResourceMap>): ResourceMap {
  return { ...emptyResources(), ...values };
}

function createActionState(): AppState {
  const rolled = gameReducer(createInitialAppState(), {
    type: "ROLL_DICE",
    playerId: "p1",
    dice: [1, 1]
  });
  return {
    ...rolled,
    game: {
      ...rolled.game,
      players: rolled.game.players.map((player) => ({
        ...player,
        resources:
          player.id === "p1"
            ? bundle({ wood: 3, brick: 2 })
            : player.id === "p2"
              ? bundle({ grain: 2, ore: 2 })
              : bundle({ wool: 1 })
      }))
    }
  };
}

describe("public player resource trade", () => {
  it("publishes one affordable multi-resource offer during the active action phase", () => {
    const state = createActionState();
    const offered = bundle({ wood: 2, brick: 1 });
    const requested = bundle({ grain: 1, ore: 1 });

    const offer = createPlayerTradeOffer(state.game, "p1", offered, requested);
    expect(offer).toEqual({ proposerId: "p1", offered, requested });
    expect(offer.offered).not.toBe(offered);
    expect(offer.requested).not.toBe(requested);

    const published = unsafeExecuteGameCommandForTests(state, {
      type: "PUBLISH_PLAYER_TRADE",
      playerId: "p1",
      offered,
      requested
    });
    expect(published.pendingPlayerTrade).toEqual(offer);

    expect(() =>
      unsafeExecuteGameCommandForTests(published, {
        type: "PUBLISH_PLAYER_TRADE",
        playerId: "p1",
        offered: bundle({ wood: 1 }),
        requested: bundle({ wool: 1 })
      })
    ).toThrow(/one public player trade/i);
  });

  it("rejects empty, non-whole, negative, unaffordable, and out-of-phase offers", () => {
    const state = createActionState();
    const validOffered = bundle({ wood: 1 });
    const validRequested = bundle({ grain: 1 });

    expect(() => createPlayerTradeOffer(state.game, "p1", bundle({}), validRequested)).toThrow(/offered bundle/i);
    expect(() => createPlayerTradeOffer(state.game, "p1", validOffered, bundle({}))).toThrow(/requested bundle/i);
    expect(() => createPlayerTradeOffer(state.game, "p1", bundle({ wood: 1.5 }), validRequested)).toThrow(/whole numbers/i);
    expect(() => createPlayerTradeOffer(state.game, "p1", validOffered, bundle({ ore: -1 }))).toThrow(/whole numbers/i);
    expect(() => createPlayerTradeOffer(state.game, "p1", bundle({ wood: 4 }), validRequested)).toThrow(/cannot afford/i);
    expect(() => createPlayerTradeOffer(state.game, "p2", validOffered, validRequested)).toThrow(/active player/i);

    const awaitingRoll = createInitialAppState();
    expect(() => createPlayerTradeOffer(awaitingRoll.game, "p1", validOffered, validRequested)).toThrow(/action phase/i);
  });

  it("accepts atomically, conserves each resource, and clears the offer", () => {
    const state = createActionState();
    const published = unsafeExecuteGameCommandForTests(state, {
      type: "PUBLISH_PLAYER_TRADE",
      playerId: "p1",
      offered: bundle({ wood: 2, brick: 1 }),
      requested: bundle({ grain: 1, ore: 1 })
    });
    const beforeTotals = Object.fromEntries(
      resources.map((resource) => [
        resource,
        published.game.players.reduce((sum, player) => sum + player.resources[resource], 0)
      ])
    );

    const acceptedGame = acceptPlayerTrade(
      published.game,
      published.pendingPlayerTrade!,
      "p2"
    );
    expect(acceptedGame.players.find((player) => player.id === "p1")!.resources).toEqual(
      bundle({ wood: 1, brick: 1, grain: 1, ore: 1 })
    );
    expect(acceptedGame.players.find((player) => player.id === "p2")!.resources).toEqual(
      bundle({ wood: 2, brick: 1, grain: 1, ore: 1 })
    );
    for (const resource of resources) {
      expect(acceptedGame.players.reduce((sum, player) => sum + player.resources[resource], 0)).toBe(
        beforeTotals[resource]
      );
    }

    const accepted = unsafeExecuteGameCommandForTests(published, {
      type: "ACCEPT_PLAYER_TRADE",
      playerId: "p2"
    });
    expect(accepted.game.players).toEqual(acceptedGame.players);
    expect(accepted.pendingPlayerTrade).toBeUndefined();
    expect(accepted.game.log[0].messageKey).toBe("trade.player.accepted");
  });

  it("preserves inventories and the offer when either side can no longer afford acceptance", () => {
    const state = createActionState();
    const published = gameReducer(state, {
      type: "PUBLISH_PLAYER_TRADE",
      playerId: "p1",
      offered: bundle({ wood: 2 }),
      requested: bundle({ grain: 2 })
    });

    const activeRejected = gameReducer(published, {
      type: "ACCEPT_PLAYER_TRADE",
      playerId: "p1"
    });
    expect(activeRejected.game).toBe(published.game);
    expect(activeRejected.pendingPlayerTrade).toBe(published.pendingPlayerTrade);
    expect(activeRejected.notice).toMatch(/own offer/i);

    const poorOpponent = {
      ...published,
      game: {
        ...published.game,
        players: published.game.players.map((player) =>
          player.id === "p2" ? { ...player, resources: bundle({ grain: 1 }) } : player
        )
      }
    };
    const opponentRejected = gameReducer(poorOpponent, {
      type: "ACCEPT_PLAYER_TRADE",
      playerId: "p2"
    });
    expect(opponentRejected.game).toBe(poorOpponent.game);
    expect(opponentRejected.pendingPlayerTrade).toBe(poorOpponent.pendingPlayerTrade);

    const poorProposer = {
      ...published,
      game: {
        ...published.game,
        players: published.game.players.map((player) =>
          player.id === "p1" ? { ...player, resources: bundle({ wood: 1 }) } : player
        )
      }
    };
    const proposerRejected = gameReducer(poorProposer, {
      type: "ACCEPT_PLAYER_TRADE",
      playerId: "p2"
    });
    expect(proposerRejected.game).toBe(poorProposer.game);
    expect(proposerRejected.pendingPlayerTrade).toBe(poorProposer.pendingPlayerTrade);
  });

  it("allows active-player cancellation and clears an unresolved offer at end turn", () => {
    const state = createActionState();
    const published = unsafeExecuteGameCommandForTests(state, {
      type: "PUBLISH_PLAYER_TRADE",
      playerId: "p1",
      offered: bundle({ wood: 1 }),
      requested: bundle({ grain: 1 })
    });

    expect(() =>
      unsafeExecuteGameCommandForTests(published, {
        type: "CANCEL_PLAYER_TRADE",
        playerId: "p2"
      })
    ).toThrow(/active player/i);

    const cancelled = unsafeExecuteGameCommandForTests(published, {
      type: "CANCEL_PLAYER_TRADE",
      playerId: "p1"
    });
    expect(cancelled.pendingPlayerTrade).toBeUndefined();

    const ended = unsafeExecuteGameCommandForTests(published, {
      type: "END_TURN",
      playerId: "p1"
    });
    expect(ended.pendingPlayerTrade).toBeUndefined();
  });
});
