import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { gameReducer } from "../../src/app/gameReducer";
import { createCommerceGuild } from "../../src/domain/expansion/commerceGuild";
import {
  LEGACY_STANDARD_MAP_SEED,
  formatM1MapSeed,
  type MapSeed
} from "../../src/domain/mapSeed";
import { applyMatchCommand } from "../../src/domain/match/applyMatchCommand";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import {
  DeterministicRandomSource,
  type RandomSource
} from "../../src/domain/match/random";
import { createBoardDataForSeed } from "../../src/domain/randomBoard";
import { createDevelopmentDeck } from "../../src/domain/rules/developmentCards";
import { createSetupGame } from "../../src/domain/setup";
import type {
  DiceRoll,
  MatchCommand,
  MatchExecutionContext,
  MatchState
} from "../../src/domain/match/types";
import { emptyResources, type PlayerId, type ResourceMap } from "../../src/domain/types";
import {
  createScenarioAppState,
  createScenarioGame
} from "../fixtures/createScenarioGame";

const MAP_SEED_A = formatM1MapSeed(0x0123_4567, 0x89ab_cdef);
const MAP_SEED_B = formatM1MapSeed(0x7654_3210, 0xfedc_ba98);
const THREE_SEATS = ["One", "Two", "Three"].map((nickname) => ({ nickname }));
const DECK_RANDOM_VALUES = Array.from({ length: 24 }, () => 0);

interface TrackedContext {
  context: MatchExecutionContext;
  mapSeedCalls(): number;
  randomCalls(): number;
}

function createTrackedContext(
  values: readonly number[] = [],
  mapSeeds: readonly MapSeed[] = [MAP_SEED_A]
): TrackedContext {
  let nextLogNumber = 0;
  let mapSeedIndex = 0;
  let randomCallCount = 0;
  const hiddenRandom = new DeterministicRandomSource(values);
  const random: RandomSource = {
    nextInt(maxExclusive) {
      randomCallCount += 1;
      return hiddenRandom.nextInt(maxExclusive);
    }
  };
  return {
    context: {
      random,
      nextMapSeed: () => {
        const seed = mapSeeds[mapSeedIndex];
        mapSeedIndex += 1;
        if (!seed) {
          throw new RangeError("Deterministic map-seed sequence is exhausted.");
        }
        return seed;
      },
      nextLogId: () => `test-log-${++nextLogNumber}`,
      now: () => 1_700_000_000_000
    },
    mapSeedCalls: () => mapSeedIndex,
    randomCalls: () => randomCallCount
  };
}

function createContext(
  values: readonly number[] = [],
  mapSeeds: readonly MapSeed[] = [MAP_SEED_A]
): MatchExecutionContext {
  return createTrackedContext(values, mapSeeds).context;
}

function toMatchState(state = createScenarioAppState()): MatchState {
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

function createDirtyMatch(seed = MAP_SEED_A): MatchState {
  const base = createSetupMatch(
    THREE_SEATS,
    { kind: "seed", seed },
    createContext(DECK_RANDOM_VALUES)
  );
  const developmentCard = createDevelopmentDeck(["monopoly"])[0];
  return {
    game: {
      ...base.game,
      phase: "gameOver",
      players: base.game.players.map((player, index) => ({
        ...player,
        resources: { wood: index + 1, brick: 2, wool: 3, grain: 4, ore: 5 },
        guildTokens: index + 1,
        vouchers: 2,
        prizeCards: 3,
        developmentCards: [{ ...developmentCard, id: `dirty-card-${player.id}` }],
        knightsPlayed: 4
      })),
      activePlayerId: "p3",
      turn: 9,
      round: 4,
      turnState: {
        phase: "awaitingDevelopmentEffect",
        pendingDiscards: { p2: 3 },
        pendingRobber: {
          source: "knight",
          resumePhase: "action",
          targetHexId: base.game.board[0].id,
          eligibleVictimIds: ["p2"]
        },
        pendingDevelopmentEffect: {
          kind: "monopoly",
          playerId: "p3",
          resumePhase: "action"
        },
        developmentCardPlayed: true
      },
      targetScore: 3,
      buildings: [{
        id: "dirty-building",
        ownerId: "p2",
        vertexId: base.game.board[0].vertexIds[0],
        kind: "city"
      }],
      roads: [{ id: "dirty-road", ownerId: "p1", edgeId: base.game.edges[0].id }],
      robberHexId: base.game.board[0].id,
      bank: { resources: { wood: 1, brick: 2, wool: 3, grain: 4, ore: 5 } },
      log: [{ id: "dirty-log", message: "Old match state" }],
      developmentDeck: base.game.developmentDeck.slice(0, 2),
      setup: undefined,
      winnerId: "p3",
      largestArmyOwnerId: "p2",
      longestRoadOwnerId: "p1"
    },
    guild: {
      ...base.guild,
      usedTradePlayerIds: ["p1"],
      gathering: {
        phase: "auction",
        redemptions: { p1: 2 },
        auctionRound: 2,
        auctionResults: [{ kind: "voucher" }],
        lastAuctionSummary: "Old auction",
        lastAuctionResult: {
          winnerId: "p1",
          winnerName: "One",
          round: 1,
          winningBid: 2,
          outcome: { kind: "voucher" }
        }
      }
    },
    lastDice: { first: 3, second: 4, total: 7 },
    pendingPlayerTrade: {
      proposerId: "p1",
      offered: { ...emptyResources(), wood: 1 },
      requested: { ...emptyResources(), grain: 1 }
    }
  };
}

function expectCompleteSetupReset(
  match: MatchState,
  seed: MapSeed,
  expectedNames = ["One", "Two", "Three"]
): void {
  const boardData = createBoardDataForSeed(seed);
  expect(match.game.mapSeed).toBe(seed);
  expect({
    board: match.game.board,
    edges: match.game.edges,
    ports: match.game.ports
  }).toEqual(boardData);
  expect(match.game).toMatchObject({
    phase: "setup",
    activePlayerId: "p1",
    turn: 1,
    round: 1,
    targetScore: 10,
    turnState: { phase: "awaitingRoll", pendingDiscards: {} },
    buildings: [],
    roads: [],
    bank: { resources: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 } },
    setup: {
      order: ["p1", "p2", "p3", "p3", "p2", "p1"],
      placementIndex: 0,
      stage: "settlement"
    }
  });
  expect(match.game.players.map((player) => player.name)).toEqual(expectedNames);
  for (const player of match.game.players) {
    expect(player).toMatchObject({
      resources: emptyResources(),
      guildTokens: 0,
      vouchers: 0,
      prizeCards: 0,
      developmentCards: [],
      knightsPlayed: 0
    });
  }
  expect(match.game.robberHexId).toBe(
    match.game.board.find((hex) => hex.terrain === "desert")?.id
  );
  expect(match.game.developmentDeck).toHaveLength(25);
  expect(match.game.developmentDeck).not.toEqual(createDevelopmentDeck());
  expect(match.game.turnState).not.toHaveProperty("pendingRobber");
  expect(match.game.turnState).not.toHaveProperty("pendingDevelopmentEffect");
  expect(match.game.turnState.developmentCardPlayed).toBe(false);
  expect(match.game.setup).not.toHaveProperty("pendingSettlement");
  expect(match.game).not.toHaveProperty("winnerId");
  expect(match.game).not.toHaveProperty("largestArmyOwnerId");
  expect(match.game).not.toHaveProperty("longestRoadOwnerId");
  expect(match.guild).toEqual(createCommerceGuild(3, 1));
  expect(match.lastDice).toBeNull();
  expect(match).not.toHaveProperty("pendingPlayerTrade");
  expect(match.game.log.map((entry) => entry.id)).not.toContain("dirty-log");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("match transition foundations", () => {
  it("creates stable three-player identities from caller nicknames in snake order", () => {
    const match = createSetupMatch(
      [{ nickname: "Ada" }, { nickname: "Grace" }, { nickname: "Linus" }],
      { kind: "seed", seed: MAP_SEED_A },
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
      { kind: "seed", seed: MAP_SEED_A },
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
      { kind: "seed", seed: MAP_SEED_A },
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
      createSetupMatch(
        ["One", "Two"].map((nickname) => ({ nickname })),
        { kind: "fresh" },
        context
      )
    ).toThrow(/three or four/i);
    expect(() =>
      createSetupMatch(
        ["One", "Two", "Three", "Four", "Five"].map((nickname) => ({ nickname })),
        { kind: "fresh" },
        context
      )
    ).toThrow(/three or four/i);
  });

  it("keeps createSetupGame as a no-argument compatibility wrapper", () => {
    const unsafeCreateSetupGame = createSetupGame as unknown as (
      playerNames: readonly string[],
      developmentDeck?: ReturnType<typeof createDevelopmentDeck>
    ) => ReturnType<typeof createSetupGame>;

    expect(() => unsafeCreateSetupGame(["One", "Two"])).toThrow(/does not accept arguments/i);
    expect(() =>
      unsafeCreateSetupGame(["One", "Two", "Three", "Four", "Five"])
    ).toThrow(/does not accept arguments/i);
    expect(() =>
      unsafeCreateSetupGame(
        ["One", "Two", "Three"],
        createDevelopmentDeck(["monopoly"])
      )
    ).toThrow(/does not accept arguments/i);
  });

  it("does not parameterize the prepared scenario fixture", () => {
    const unsafeCreateScenarioGame = createScenarioGame as unknown as (
      playerNames: readonly string[]
    ) => ReturnType<typeof createScenarioGame>;

    expect(unsafeCreateScenarioGame(["One", "Two", "Three"]).players.map((player) => player.name))
      .toEqual(["Voyage1969", "Loss", "Kay", "Amias"]);
  });

  it("keeps only synchronized gameplay fields in MatchState", () => {
    const appState = createScenarioAppState();
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
      nextMapSeed: () => MAP_SEED_A,
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

  it("creates a complete empty setup from a supplied seed without consuming map entropy", () => {
    const tracked = createTrackedContext(DECK_RANDOM_VALUES, [MAP_SEED_B]);

    const match = createSetupMatch(
      THREE_SEATS,
      { kind: "seed", seed: MAP_SEED_A },
      tracked.context
    );

    expectCompleteSetupReset(match, MAP_SEED_A);
    expect(match.game.log.map((entry) => entry.messageKey)).toEqual(["setup.started"]);
    expect(tracked.mapSeedCalls()).toBe(0);
    expect(tracked.randomCalls()).toBe(24);
  });

  it("draws one map seed for a fresh setup while keeping board generation off hidden randomness", () => {
    const tracked = createTrackedContext(DECK_RANDOM_VALUES, [MAP_SEED_A]);

    const match = createSetupMatch(THREE_SEATS, { kind: "fresh" }, tracked.context);

    expectCompleteSetupReset(match, MAP_SEED_A);
    expect(tracked.mapSeedCalls()).toBe(1);
    expect(tracked.randomCalls()).toBe(24);
  });

  it("rejects a legacy fixed-board seed from the fresh seed source", () => {
    const tracked = createTrackedContext(DECK_RANDOM_VALUES, [LEGACY_STANDARD_MAP_SEED]);

    expect(() =>
      createSetupMatch(THREE_SEATS, { kind: "fresh" }, tracked.context)
    ).toThrow(/fresh.*M1/i);
    expect(tracked.mapSeedCalls()).toBe(1);
    expect(tracked.randomCalls()).toBe(0);
  });

  it("restarts on the same map while retaining only roster and seed/layout", () => {
    const dirty = createDirtyMatch();
    const originalRoster = dirty.game.players.map(({ id, name, color }) => ({ id, name, color }));
    const tracked = createTrackedContext(DECK_RANDOM_VALUES, [MAP_SEED_B]);

    const restarted = apply(
      dirty,
      { type: "START_NEW_GAME", mode: "sameMap" },
      tracked.context
    );

    expectCompleteSetupReset(restarted, MAP_SEED_A);
    expect(restarted.game.players.map(({ id, name, color }) => ({ id, name, color }))).toEqual(
      originalRoster
    );
    expect(restarted.game.log.map((entry) => entry.messageKey)).toEqual([
      "setup.newGameStarted",
      "setup.started"
    ]);
    expect(tracked.mapSeedCalls()).toBe(0);
    expect(tracked.randomCalls()).toBe(24);
  });

  it("restarts on a fresh map while retaining only the roster", () => {
    const dirty = createDirtyMatch();
    const previousLayout = {
      board: dirty.game.board,
      edges: dirty.game.edges,
      ports: dirty.game.ports
    };
    const originalRoster = dirty.game.players.map(({ id, name, color }) => ({ id, name, color }));
    const tracked = createTrackedContext(DECK_RANDOM_VALUES, [MAP_SEED_B]);

    const restarted = apply(
      dirty,
      { type: "START_NEW_GAME", mode: "fresh" },
      tracked.context
    );

    expectCompleteSetupReset(restarted, MAP_SEED_B);
    expect(restarted.game.players.map(({ id, name, color }) => ({ id, name, color }))).toEqual(
      originalRoster
    );
    expect({
      board: restarted.game.board,
      edges: restarted.game.edges,
      ports: restarted.game.ports
    }).not.toEqual(previousLayout);
    expect(tracked.mapSeedCalls()).toBe(1);
    expect(tracked.randomCalls()).toBe(24);
  });

  it("keeps invalid-seat, malformed-seed, and hidden-random failures atomic", () => {
    const dirty = createDirtyMatch();
    const invalidRoster = {
      ...dirty,
      game: { ...dirty.game, players: dirty.game.players.slice(0, 2) }
    };
    const invalidRosterSnapshot = structuredClone(invalidRoster);
    const invalidSeatsContext = createTrackedContext(DECK_RANDOM_VALUES, [MAP_SEED_B]);

    expect(() =>
      apply(
        invalidRoster,
        { type: "START_NEW_GAME", mode: "fresh" },
        invalidSeatsContext.context
      )
    ).toThrow(/three or four/i);
    expect(invalidRoster).toEqual(invalidRosterSnapshot);
    expect(invalidSeatsContext.mapSeedCalls()).toBe(0);
    expect(invalidSeatsContext.randomCalls()).toBe(0);

    const malformedSeed = "M1-NOT-CANONICAL" as MapSeed;
    const malformed = {
      ...dirty,
      game: { ...dirty.game, mapSeed: malformedSeed }
    };
    const malformedSnapshot = structuredClone(malformed);
    const malformedContext = createTrackedContext(DECK_RANDOM_VALUES, [MAP_SEED_B]);

    expect(() =>
      apply(
        malformed,
        { type: "START_NEW_GAME", mode: "sameMap" },
        malformedContext.context
      )
    ).toThrow(/map seed/i);
    expect(malformed).toEqual(malformedSnapshot);
    expect(malformedContext.mapSeedCalls()).toBe(0);
    expect(malformedContext.randomCalls()).toBe(0);

    const exhaustedSnapshot = structuredClone(dirty);
    const exhaustedContext = createTrackedContext([], [MAP_SEED_B]);

    expect(() =>
      apply(
        dirty,
        { type: "START_NEW_GAME", mode: "sameMap" },
        exhaustedContext.context
      )
    ).toThrow(/random sequence is exhausted/i);
    expect(dirty).toEqual(exhaustedSnapshot);
    expect(exhaustedContext.mapSeedCalls()).toBe(0);
    expect(exhaustedContext.randomCalls()).toBe(1);
  });

  it("rejects a malformed explicitly selected seed before hidden deck randomness", () => {
    const tracked = createTrackedContext(DECK_RANDOM_VALUES, [MAP_SEED_B]);

    expect(() =>
      createSetupMatch(
        THREE_SEATS,
        { kind: "seed", seed: "M1-LOWER-or-short" as MapSeed },
        tracked.context
      )
    ).toThrow(/map seed/i);
    expect(tracked.mapSeedCalls()).toBe(0);
    expect(tracked.randomCalls()).toBe(0);
  });

  it("starts setup and applies setup placements through the shared dispatcher", () => {
    const started = apply(
      toMatchState(),
      { type: "START_NEW_GAME", mode: "fresh" },
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
      guild: {
        ...base.guild,
        gatheringCooldown: {
          availableAtTurn: base.game.turn,
          displayDuration: base.game.players.length
        }
      },
      game: {
        ...base.game,
        turnState: { phase: "action" as const, pendingDiscards: {} },
        players: base.game.players.map((player) =>
          player.id === "p1" ? { ...player, guildTokens: 1 } : player
        )
      }
    };
    const started = apply(funded, { type: "START_GATHERING", playerId: "p1" });
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
    const state = createScenarioAppState();
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
