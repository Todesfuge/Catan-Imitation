import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createInitialAppState, gameReducer } from "../../src/app/gameReducer";
import { applyMatchCommand } from "../../src/domain/match/applyMatchCommand";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import { DeterministicRandomSource } from "../../src/domain/match/random";
import type {
  DiceRoll,
  MatchCommand,
  MatchExecutionContext,
  MatchState
} from "../../src/domain/match/types";
import { emptyResources, type PlayerId, type ResourceMap } from "../../src/domain/types";

function createContext(values: readonly number[] = []): MatchExecutionContext {
  let nextLogNumber = 0;
  return {
    random: new DeterministicRandomSource(values),
    nextLogId: () => `test-log-${++nextLogNumber}`,
    now: () => 1_700_000_000_000
  };
}

function toMatchState(state = createInitialAppState()): MatchState {
  return {
    game: state.game,
    guild: state.guild,
    lastDice: state.lastDice,
    pendingPlayerTrade: state.pendingPlayerTrade
  };
}

function withResources(
  state: MatchState,
  resourcesByPlayer: Partial<Record<PlayerId, Partial<ResourceMap>>>
): MatchState {
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

function apply(
  state: MatchState,
  command: MatchCommand,
  context = createContext()
): MatchState {
  return applyMatchCommand(state, command, context);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("match transition foundations", () => {
  it("creates stable three-player identities from caller nicknames in snake order", () => {
    const match = createSetupMatch(
      [{ nickname: "Ada" }, { nickname: "Grace" }, { nickname: "Linus" }],
      createContext(Array.from({ length: 24 }, () => 0))
    );

    expect(match.game.players.map(({ id, name, color }) => ({ id, name, color }))).toEqual([
      { id: "p1", name: "Ada", color: "#f2f2f2" },
      { id: "p2", name: "Grace", color: "#ef4444" },
      { id: "p3", name: "Linus", color: "#f97316" }
    ]);
    expect(new Set(match.game.players.map((player) => player.id)).size).toBe(3);
    expect(new Set(match.game.players.map((player) => player.color)).size).toBe(3);
    expect(match.game.setup?.order).toEqual(["p1", "p2", "p3", "p3", "p2", "p1"]);
    expect(match.game.activePlayerId).toBe("p1");
  });

  it("creates the four-player snake order with the fourth stable identity", () => {
    const match = createSetupMatch(
      ["One", "Two", "Three", "Four"].map((nickname) => ({ nickname })),
      createContext(Array.from({ length: 24 }, () => 0))
    );

    expect(match.game.players[3]).toMatchObject({
      id: "p4",
      name: "Four",
      color: "#2563eb"
    });
    expect(match.game.setup?.order).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p4",
      "p3",
      "p2",
      "p1"
    ]);
  });

  it("shuffles the development deck only through injected deterministic randomness", () => {
    const mathRandom = vi.spyOn(Math, "random");
    const match = createSetupMatch(
      ["One", "Two", "Three"].map((nickname) => ({ nickname })),
      createContext(Array.from({ length: 24 }, () => 0))
    );

    expect(match.game.developmentDeck).toHaveLength(25);
    expect(match.game.developmentDeck[0].id).toBe("dev-2-knight");
    expect(match.game.developmentDeck.at(-1)?.id).toBe("dev-1-knight");
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it("rejects match creation outside the supported three or four seats", () => {
    const context = createContext();

    expect(() =>
      createSetupMatch(["One", "Two"].map((nickname) => ({ nickname })), context)
    ).toThrow(/three or four/i);
    expect(() =>
      createSetupMatch(
        ["One", "Two", "Three", "Four", "Five"].map((nickname) => ({ nickname })),
        context
      )
    ).toThrow(/three or four/i);
  });

  it("keeps only synchronized gameplay fields in MatchState", () => {
    const appState = createInitialAppState();
    const lastDice: DiceRoll = { first: 3, second: 5, total: 8 };
    const matchState: MatchState = {
      game: appState.game,
      guild: appState.guild,
      lastDice,
      pendingPlayerTrade: appState.pendingPlayerTrade
    };

    expect(Object.keys(matchState).sort()).toEqual([
      "game",
      "guild",
      "lastDice",
      "pendingPlayerTrade"
    ]);
    expect(matchState).not.toHaveProperty("selectedDiceTotal");
    expect(matchState).not.toHaveProperty("selectedPlayerId");
    expect(matchState).not.toHaveProperty("notice");
    expectTypeOf(matchState).not.toHaveProperty("selectedDiceTotal");
    expectTypeOf(matchState).not.toHaveProperty("selectedPlayerId");
    expectTypeOf(matchState).not.toHaveProperty("notice");
  });

  it("accepts deterministic execution dependencies for log IDs, time, and dice", () => {
    let nextLogNumber = 0;
    const context: MatchExecutionContext = {
      random: new DeterministicRandomSource([2, 4]),
      nextLogId: () => `test-log-${++nextLogNumber}`,
      now: () => 1_700_000_000_000
    };

    expect(context.nextLogId()).toBe("test-log-1");
    expect(context.nextLogId()).toBe("test-log-2");
    expect(context.now()).toBe(1_700_000_000_000);
    expect([
      context.random.nextInt(6) + 1,
      context.random.nextInt(6) + 1
    ]).toEqual([3, 5]);
  });

  it("rejects invalid deterministic random values instead of changing their distribution", () => {
    expect(() => new DeterministicRandomSource([6]).nextInt(6)).toThrow(RangeError);
    expect(() => new DeterministicRandomSource([0]).nextInt(0)).toThrow(RangeError);
  });

  it("starts setup and applies setup placements through the shared dispatcher", () => {
    const started = apply(
      toMatchState(),
      { type: "START_NEW_GAME" },
      createContext(Array.from({ length: 24 }, () => 0))
    );
    const vertexId = started.game.board[0].vertexIds[0];
    const settled = apply(started, {
      type: "PLACE_SETUP_SETTLEMENT",
      playerId: "p1",
      vertexId
    });
    const edgeId = settled.game.edges.find((edge) => edge.vertexIds.includes(vertexId))?.id ?? "";
    const roaded = apply(settled, { type: "PLACE_SETUP_ROAD", playerId: "p1", edgeId });

    expect(started.game.log[0]).toMatchObject({
      id: "test-log-1",
      messageKey: "setup.newGameStarted"
    });
    expect(settled.game.setup?.stage).toBe("road");
    expect(roaded.game.activePlayerId).toBe("p2");
  });

  it("uses injected randomness for dice, seven handling, and robber theft", () => {
    const context = createContext([2, 3, 0]);
    const funded = withResources(toMatchState(), { p2: { ore: 1 } });
    const rolled = apply(funded, { type: "ROLL_DICE", playerId: "p1" }, context);
    const placed = apply(
      rolled,
      { type: "PLACE_ROBBER", playerId: "p1", hexId: "mountain-8" },
      context
    );
    const stolen = apply(
      placed,
      { type: "STEAL_ROBBER_RESOURCE", playerId: "p1", victimId: "p2" },
      context
    );

    expect(rolled.lastDice).toEqual({ first: 3, second: 4, total: 7 });
    expect(rolled.game.turnState.phase).toBe("awaitingRobberPlacement");
    expect(placed.game.turnState.phase).toBe("awaitingRobberVictim");
    expect(stolen.game.players.find((player) => player.id === "p1")?.resources.ore).toBe(1);
    expect(stolen.game.turnState.phase).toBe("action");
  });

  it("applies build, development-card, maritime-trade, and winner orchestration", () => {
    const context = createContext([0, 0]);
    const funded = withResources(toMatchState(), {
      p1: { wood: 5, brick: 5, wool: 5, grain: 5, ore: 5 }
    });
    const rolled = apply(funded, { type: "ROLL_DICE", playerId: "p1" }, context);
    const ownedRoad = rolled.game.roads.find((road) => road.ownerId === "p1");
    const ownedEdge = rolled.game.edges.find((edge) => edge.id === ownedRoad?.edgeId);
    const edgeId = rolled.game.edges.find(
      (edge) =>
        !rolled.game.roads.some((road) => road.edgeId === edge.id) &&
        edge.vertexIds.some((vertexId) => ownedEdge?.vertexIds.includes(vertexId))
    )?.id ?? "";
    const built = apply(rolled, { type: "BUILD_ROAD", playerId: "p1", edgeId });
    const bought = apply(built, { type: "BUY_DEVELOPMENT_CARD", playerId: "p1" });
    const traded = apply(
      bought,
      { type: "MARITIME_TRADE", playerId: "p1", give: "wood", receive: "ore" }
    );
    const winnerCandidate = {
      ...toMatchState(),
      game: { ...toMatchState().game, targetScore: 2 }
    };
    const won = apply(
      winnerCandidate,
      { type: "ROLL_DICE", playerId: "p1" },
      createContext([3, 3])
    );

    expect(built.game.roads.some((road) => road.edgeId === edgeId)).toBe(true);
    expect(bought.game.log[0].messageKey).toBe("development.bought");
    expect(traded.game.log[0].messageKey).toBe("trade.maritime");
    expect(won.game).toMatchObject({ phase: "gameOver", winnerId: "p1" });
  });

  it("publishes and accepts player trades, then clears unresolved offers at turn end", () => {
    const context = createContext([0, 0]);
    const action = withResources(
      apply(toMatchState(), { type: "ROLL_DICE", playerId: "p1" }, context),
      { p1: { wood: 2 }, p2: { grain: 2 } }
    );
    const offered = { ...emptyResources(), wood: 1 };
    const requested = { ...emptyResources(), grain: 1 };
    const published = apply(action, {
      type: "PUBLISH_PLAYER_TRADE",
      playerId: "p1",
      offered,
      requested
    });
    const accepted = apply(published, { type: "ACCEPT_PLAYER_TRADE", playerId: "p2" });
    const republished = apply(accepted, {
      type: "PUBLISH_PLAYER_TRADE",
      playerId: "p1",
      offered,
      requested
    });
    const ended = apply(republished, { type: "END_TURN", playerId: "p1" });

    expect(published.pendingPlayerTrade).toMatchObject({ proposerId: "p1" });
    expect(accepted.pendingPlayerTrade).toBeUndefined();
    expect(accepted.game.log[0].messageKey).toBe("trade.player.accepted");
    expect(ended.pendingPlayerTrade).toBeUndefined();
    expect(ended.lastDice).toBeNull();
  });

  it("applies Commerce Guild actions through the shared dispatcher", () => {
    const base = toMatchState();
    const funded = {
      ...base,
      game: {
        ...base.game,
        players: base.game.players.map((player) =>
          player.id === "p1" ? { ...player, guildTokens: 1 } : player
        )
      }
    };
    const started = apply(funded, { type: "START_GATHERING" });
    const redeemed = apply(started, {
      type: "REDEEM_GATHERING",
      playerId: "p1",
      resources: { wood: 1 }
    });
    const auction = apply(redeemed, { type: "OPEN_AUCTION" });

    expect(started.guild.gathering.phase).toBe("redemption");
    expect(redeemed.game.log[0].messageKey).toBe("guild.redeemedResources");
    expect(["auction", "complete"]).toContain(auction.guild.gathering.phase);
  });

  it("uses injected randomness for a won Commerce Guild blind box", () => {
    const mathRandom = vi.spyOn(Math, "random").mockReturnValue(0.6);
    const base = toMatchState();
    const auction = {
      ...base,
      game: {
        ...base.game,
        players: base.game.players.map((player) =>
          player.id === "p1" ? { ...player, guildTokens: 2 } : player
        )
      },
      guild: {
        ...base.guild,
        gathering: {
          ...base.guild.gathering,
          phase: "auction" as const,
          auctionRound: 1
        }
      }
    };
    const beforeCards =
      auction.game.players.find((player) => player.id === "p1")?.developmentCards.length ?? 0;

    const resolved = apply(
      auction,
      { type: "RESOLVE_AUCTION", bids: { p1: 1, p2: 0, p3: 0, p4: 0 } },
      createContext([0xffff_ffff])
    );

    expect(resolved.guild.gathering.lastAuctionResult).toMatchObject({
      winnerId: "p1",
      winningBid: 1,
      outcome: { kind: "developmentCard" }
    });
    expect(
      resolved.game.players.find((player) => player.id === "p1")?.developmentCards
    ).toHaveLength(beforeCards + 1);
    expect(resolved.game.log[0].messageKey).toBe("guild.auctionResolved");
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it("throws recoverable domain errors while the local adapter preserves UI state and notice", () => {
    const state = createInitialAppState();
    const match = toMatchState(state);

    expect(() =>
      apply(match, { type: "END_TURN", playerId: "p1" })
    ).toThrow(/roll/i);

    const selected = gameReducer(state, { type: "SELECT_DICE_TOTAL", diceTotal: 10 });
    const recovered = gameReducer(selected, { type: "END_TURN", playerId: "p1" });

    expect(recovered.game).toBe(selected.game);
    expect(recovered.selectedDiceTotal).toBe(10);
    expect(recovered.notice).toMatch(/roll/i);
  });
});
