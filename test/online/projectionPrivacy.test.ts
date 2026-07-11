import { describe, expect, it } from "vitest";

import { createCommerceGuild } from "../../src/domain/expansion/commerceGuild";
import { createDemoGame } from "../../src/domain/match/createMatch";
import type { MatchState } from "../../src/domain/match/types";
import { calculatePlayerScore } from "../../src/domain/rules/scoring";
import {
  emptyResources,
  resources,
  type DevelopmentCard,
  type GameState
} from "../../src/domain/types";
import {
  projectRoomView,
  type ProjectableRoomState
} from "../../src/online/projectRoomView";
import { executeMatchCommandForTest } from "../domain/matchCommandTestUtils";

const ownCard: DevelopmentCard = {
  id: "own-card-id",
  kind: "knight",
  purchasedTurn: 1,
  revealed: false
};

const opponentCards: DevelopmentCard[] = [
  {
    id: "opponent-action-card-id",
    kind: "monopoly",
    purchasedTurn: 1,
    revealed: false
  },
  {
    id: "opponent-hidden-vp-id",
    kind: "victoryPoint",
    purchasedTurn: 1,
    revealed: false
  }
];

const cardsByPlayerId: Record<string, DevelopmentCard[]> = {
  p1: [ownCard],
  p2: opponentCards,
  p3: [
    {
      id: "seat-3-private-card-id",
      kind: "roadBuilding",
      purchasedTurn: 1,
      revealed: false
    }
  ],
  p4: [
    {
      id: "seat-4-private-card-id",
      kind: "yearOfPlenty",
      purchasedTurn: 1,
      revealed: false
    }
  ]
};

function createMatchState(phase: GameState["phase"] = "playing"): MatchState {
  const base = createDemoGame();
  const game: GameState = {
    ...base,
    phase,
    winnerId: phase === "gameOver" ? "p2" : undefined,
    players: base.players.map((player) => {
      if (player.id === "p1") {
        return {
          ...player,
          resources: { wood: 1, brick: 2, wool: 3, grain: 4, ore: 5 },
          guildTokens: 900_001,
          developmentCards: [ownCard]
        };
      }
      if (player.id === "p2") {
        return {
          ...player,
          resources: { wood: 101, brick: 102, wool: 103, grain: 104, ore: 105 },
          guildTokens: 900_002,
          developmentCards: opponentCards
        };
      }
      return {
        ...player,
        resources: emptyResources(),
        developmentCards: cardsByPlayerId[player.id].map((card) => ({ ...card }))
      };
    }),
    turnState: {
      ...base.turnState,
      phase: "awaitingDiscards",
      pendingDiscards: { p1: 4, p2: 3 }
    },
    developmentDeck: [
      { id: "raw-deck-secret-id", kind: "roadBuilding", purchasedTurn: -1, revealed: false }
    ],
    log: [
      {
        id: "blind-box-log",
        message: "Loss won a blind box containing a monopoly development card.",
        messageKey: "guild.auctionResolved",
        params: {
          summary: "private-summary-monopoly",
          winnerName: "auction-winner-secret",
          bid: 222_222_221,
          round: 222_222_222,
          outcomeKind: "auction-outcome-secret-monopoly",
          cardKind: "monopoly"
        }
      },
      {
        id: "malicious-dice-log",
        message: "private raw dice message",
        messageKey: "dice.rolled",
        params: {
          playerName: "standard-log-player-secret",
          total: 222_222_223,
          eventCount: -1
        }
      },
      {
        id: "malicious-resource-log",
        message: "private raw resource message",
        messageKey: "development.yearOfPlentyLog",
        params: { resource: "resource-enum-secret" }
      },
      {
        id: "malicious-hidden-vp-log",
        message: "private raw hidden victory point message",
        messageKey: "development.played",
        params: { playerName: "Loss", cardKind: "victoryPoint" }
      },
      {
        id: "safe-log",
        message: "Voyage1969 rolled 8.",
        messageKey: "dice.rolled",
        params: { playerName: "Voyage1969", total: 8, eventCount: 2 }
      }
    ]
  };
  const guild = createCommerceGuild();

  return {
    game,
    guild: {
      ...guild,
      gathering: {
        ...guild.gathering,
        phase: "auction",
        auctionResults: [{ kind: "developmentCard", card: "monopoly" }],
        lastAuctionSummary: "private-summary-monopoly",
        lastAuctionResult: {
          winnerId: "p2",
          winnerName: "Loss",
          round: 1,
          winningBid: 4,
          outcome: { kind: "developmentCard", card: "monopoly" }
        }
      }
    },
    lastDice: { first: 3, second: 5, total: 8 },
    pendingPlayerTrade: {
      proposerId: "p1",
      offered: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
      requested: { wood: 0, brick: 1, wool: 0, grain: 0, ore: 0 }
    }
  };
}

function createRoom(phase: GameState["phase"] = "playing"): ProjectableRoomState {
  return {
    roomCode: "ABC123",
    lifecycle: phase === "gameOver" ? "finished" : "playing",
    roomVersion: 12,
    hostSeatId: "seat-1",
    seats: [
      { seatId: "seat-1", playerId: "p1", nickname: "Voyage1969", ready: true },
      { seatId: "seat-2", playerId: "p2", nickname: "Loss", ready: true },
      { seatId: "seat-3", playerId: "p3", nickname: "Kay", ready: true },
      { seatId: "seat-4", playerId: "p4", nickname: "Amias", ready: true }
    ],
    matchState: createMatchState(phase),
    pendingAuction: {
      round: 2,
      bidsBySeatId: { "seat-1": 765_432, "seat-2": 876_543 }
    },
    // Deliberately simulate fields present on a future persisted Worker room.
    tokenHash: "room-token-hash-secret",
    connectionTickets: [{ ticketHash: "ticket-hash-secret", ticket: "plaintext-ticket-secret" }],
    privateErrors: { "seat-2": "opponent-private-error-secret" }
  } as ProjectableRoomState & Record<string, unknown>;
}

describe("caller-specific room projection privacy", () => {
  it("keeps opponent hands, raw deck, credentials, losing bids, errors, and blind-box kind out of JSON", () => {
    const view = projectRoomView(createRoom(), "seat-1");
    const serialized = JSON.stringify(view);
    const opponent = view.publicState.game?.players.find((player) => player.playerId === "p2");

    expect(opponent).toMatchObject({ resourceCardCount: 515, developmentCardCount: 2 });
    expect(opponent).not.toHaveProperty("resources");
    expect(opponent).not.toHaveProperty("developmentCards");
    expect(serialized).not.toContain("opponent-action-card-id");
    expect(serialized).not.toContain("opponent-hidden-vp-id");
    expect(serialized).not.toContain("raw-deck-secret-id");
    expect(serialized).not.toContain("876543");
    expect(serialized).not.toContain("room-token-hash-secret");
    expect(serialized).not.toContain("ticket-hash-secret");
    expect(serialized).not.toContain("plaintext-ticket-secret");
    expect(serialized).not.toContain("opponent-private-error-secret");
    expect(serialized).not.toContain("private-summary-monopoly");
    expect(serialized).not.toContain('"kind":"monopoly"');
    expect(serialized).not.toContain("auction-winner-secret");
    expect(serialized).not.toContain("222222221");
    expect(serialized).not.toContain("222222222");
    expect(serialized).not.toContain("auction-outcome-secret-monopoly");
    expect(serialized).not.toContain("standard-log-player-secret");
    expect(serialized).not.toContain("222222223");
    expect(serialized).not.toContain("resource-enum-secret");
    expect(serialized).not.toContain('"cardKind":"victoryPoint"');
    expect(view.publicState.submittedBidSeatIds).toEqual(["seat-1", "seat-2"]);
  });

  it("includes only the caller's private hand, decision, and unresolved bid amount", () => {
    const view = projectRoomView(createRoom(), "seat-1");

    expect(view.privateState).toMatchObject({
      seatId: "seat-1",
      playerId: "p1",
      seatTokenPresent: true,
      resources: { wood: 1, brick: 2, wool: 3, grain: 4, ore: 5 },
      developmentCards: [ownCard],
      ownPendingBid: 765_432,
      requiredDecision: { kind: "discardResources", count: 4 }
    });
    expect(view.allowedActions).toBeDefined();
    expect(JSON.stringify(view.privateState)).not.toContain("876543");
  });

  it("projects public board, bank, counts, trade, guild result, and structured safe logs", () => {
    const room = createRoom();
    const view = projectRoomView(room, "seat-1");

    expect(view.publicState).toMatchObject({
      roomCode: "ABC123",
      lifecycle: "playing",
      roomVersion: 12
    });
    expect(view.publicState).not.toHaveProperty("players");
    expect(view.publicState.game).toMatchObject({
      phase: "playing",
      activePlayerId: "p1",
      developmentDeckCount: 1,
      bank: { resources: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 } },
      lastDice: { first: 3, second: 5, total: 8 },
      pendingPlayerTrade: {
        proposerId: "p1",
        offered: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
        requested: { wood: 0, brick: 1, wool: 0, grain: 0, ore: 0 }
      }
    });
    expect(view.publicState.game?.board).toHaveLength(room.matchState!.game.board.length);
    expect(view.publicState.guild?.gathering.lastAuctionResult).toEqual({
      winnerId: "p2",
      winnerName: "Loss",
      round: 1,
      winningBid: 4,
      outcome: { kind: "developmentCard" }
    });
    expect(view.publicState.game?.log).toEqual([
      {
        id: "safe-log",
        messageKey: "dice.rolled",
        params: { playerName: "Voyage1969", total: 8, eventCount: 2 }
      }
    ]);
  });

  it("rebuilds a matching resource-auction log from the trusted guild result", () => {
    const room = createRoom();
    const resourcesWon = { wood: 2, brick: 0, wool: 1, grain: 0, ore: 0 };
    room.matchState!.guild.gathering.lastAuctionResult = {
      winnerId: "p2",
      winnerName: "untrusted-stored-winner-name",
      round: 1,
      winningBid: 4,
      outcome: { kind: "resources", resources: resourcesWon }
    };
    room.matchState!.game.log[0] = {
      id: "trusted-resource-auction-log",
      message: "raw-summary-secret",
      messageKey: "guild.auctionResolved",
      params: {
        summary: "raw-summary-secret",
        winnerName: "Loss",
        bid: 4,
        round: 1,
        outcomeKind: "resources",
        ...resourcesWon
      }
    };

    const serialized = JSON.stringify(projectRoomView(room, "seat-1"));
    expect(serialized).not.toContain("raw-summary-secret");
    expect(serialized).not.toContain("untrusted-stored-winner-name");
    expect(projectRoomView(room, "seat-1").publicState.game?.log[0]).toEqual({
      id: "trusted-resource-auction-log",
      messageKey: "guild.auctionResolved",
      params: {
        winnerName: "Loss",
        bid: 4,
        round: 1,
        outcomeKind: "resources",
        wood: 2,
        brick: 0,
        wool: 1,
        grain: 0,
        ore: 0
      }
    });
  });

  it("accepts only dice totals from 2 through 12 when every other field is valid", () => {
    const room = createRoom();
    room.matchState!.game.log = [
      ...[1, 13, 222_222_223].map((total) => ({
        id: `invalid-dice-total-${total}`,
        message: "raw",
        messageKey: "dice.rolled" as const,
        params: { playerName: "Voyage1969", total, eventCount: 0 }
      })),
      ...[2, 12].map((total) => ({
        id: `valid-dice-total-${total}`,
        message: "raw",
        messageKey: "dice.rolled" as const,
        params: { playerName: "Voyage1969", total, eventCount: 0 }
      }))
    ];

    expect(projectRoomView(room, "seat-1").publicState.game!.log.map(({ id }) => id)).toEqual([
      "valid-dice-total-2",
      "valid-dice-total-12"
    ]);
  });

  it("bounds production eventCount by the current public building count", () => {
    const room = createRoom();
    const buildingCount = room.matchState!.game.buildings.length;
    room.matchState!.game.log = [
      {
        id: "invalid-production-count",
        message: "raw",
        messageKey: "dice.rolled",
        params: { playerName: "Voyage1969", total: 8, eventCount: buildingCount + 1 }
      },
      ...[0, buildingCount].map((eventCount) => ({
        id: `valid-production-count-${eventCount}`,
        message: "raw",
        messageKey: "dice.rolled" as const,
        params: { playerName: "Voyage1969", total: 8, eventCount }
      }))
    ];

    expect(projectRoomView(room, "seat-1").publicState.game!.log.map(({ id }) => id)).toEqual([
      "valid-production-count-0",
      `valid-production-count-${buildingCount}`
    ]);
  });

  it("accepts only Commerce auction rounds from 1 through 3", () => {
    const room = createRoom();
    room.matchState!.game.log = [0, 4, 222_222_224, 1, 3].map((round) => ({
      id: `${round === 1 || round === 3 ? "valid" : "invalid"}-auction-round-${round}`,
      message: "raw",
      messageKey: "guild.auctionRoundNoBids",
      params: { round }
    }));

    expect(projectRoomView(room, "seat-1").publicState.game!.log.map(({ id }) => id)).toEqual([
      "valid-auction-round-1",
      "valid-auction-round-3"
    ]);
  });

  it("bounds token-transfer amounts by the current public guild-token total", () => {
    const room = createRoom();
    const tokenTotal = room.matchState!.game.players.reduce(
      (total, player) => total + player.guildTokens,
      0
    );
    room.matchState!.game.log = [0, tokenTotal + 1, 1, tokenTotal].map((amount) => ({
      id: `${amount >= 1 && amount <= tokenTotal ? "valid" : "invalid"}-token-amount-${amount}`,
      message: "raw",
      messageKey: "guild.tokensTransferred",
      params: { fromName: "Voyage1969", amount, toName: "Loss" }
    }));

    expect(projectRoomView(room, "seat-1").publicState.game!.log.map(({ id }) => id)).toEqual([
      "valid-token-amount-1",
      `valid-token-amount-${tokenTotal}`
    ]);
  });

  it("accepts only per-resource auction quantities from 0 through 19", () => {
    const invalidRoom = createRoom();
    const invalidResources = { wood: 20, brick: 0, wool: 0, grain: 0, ore: 0 };
    invalidRoom.matchState!.guild.gathering.lastAuctionResult = {
      winnerId: "p2",
      winnerName: "Loss",
      round: 1,
      winningBid: 4,
      outcome: { kind: "resources", resources: invalidResources }
    };
    invalidRoom.matchState!.game.log = [
      {
        id: "invalid-resource-quantity",
        message: "raw",
        messageKey: "guild.auctionResolved",
        params: {
          winnerName: "Loss",
          bid: 4,
          round: 1,
          outcomeKind: "resources",
          ...invalidResources
        }
      }
    ];
    const invalidView = projectRoomView(invalidRoom, "seat-1");
    expect(invalidView.publicState.game!.log).toEqual([]);
    expect(invalidView.publicState.guild?.gathering.lastAuctionResult).toBeUndefined();

    const validRoom = createRoom();
    const boundaryResources = { wood: 19, brick: 0, wool: 0, grain: 19, ore: 0 };
    validRoom.matchState!.guild.gathering.lastAuctionResult = {
      winnerId: "p2",
      winnerName: "Loss",
      round: 3,
      winningBid: 4,
      outcome: { kind: "resources", resources: boundaryResources }
    };
    validRoom.matchState!.game.log = [
      {
        id: "valid-resource-quantity",
        message: "raw",
        messageKey: "guild.auctionResolved",
        params: {
          winnerName: "Loss",
          bid: 4,
          round: 3,
          outcomeKind: "resources",
          ...boundaryResources
        }
      }
    ];
    expect(projectRoomView(validRoom, "seat-1").publicState.game!.log).toHaveLength(1);
  });

  it("isolates every caller and reveals a blind-box card kind only in the winner's private hand", () => {
    const room = createRoom();

    for (const seat of room.seats) {
      const view = projectRoomView(room, seat.seatId);
      const ownCards = cardsByPlayerId[seat.playerId!];
      expect(view.privateState.developmentCards).toEqual(ownCards);
      for (const [playerId, cards] of Object.entries(cardsByPlayerId)) {
        if (playerId === seat.playerId) continue;
        for (const card of cards) {
          expect(JSON.stringify(view)).not.toContain(card.id);
        }
      }
      for (const player of view.publicState.game!.players) {
        expect(player).not.toHaveProperty("resources");
        expect(player).not.toHaveProperty("developmentCards");
      }
    }

    const winnerView = projectRoomView(room, "seat-2");
    expect(winnerView.privateState.developmentCards).toContainEqual(opponentCards[0]);
    for (const seatId of ["seat-1", "seat-3", "seat-4"]) {
      const otherView = projectRoomView(room, seatId);
      expect(otherView.privateState.developmentCards).not.toContainEqual(opponentCards[0]);
      expect(JSON.stringify(otherView)).not.toContain('"kind":"monopoly"');
    }
  });

  it("serializes sealed-bid progress without opponent values and drops every pending secret after resolution", () => {
    const room = createRoom();
    for (const seat of room.seats) {
      const view = projectRoomView(room, seat.seatId);
      expect(view.publicState.submittedBidSeatIds).toEqual(["seat-1", "seat-2"]);
      expect(view.privateState.ownPendingBid).toBe(
        room.pendingAuction!.bidsBySeatId[seat.seatId]
      );
      const serialized = JSON.stringify(view);
      for (const [bidSeatId, amount] of Object.entries(room.pendingAuction!.bidsBySeatId)) {
        if (bidSeatId !== seat.seatId) expect(serialized).not.toContain(String(amount));
      }
    }

    delete room.pendingAuction;
    for (const seat of room.seats) {
      const serialized = JSON.stringify(projectRoomView(room, seat.seatId));
      expect(serialized).not.toContain("ownPendingBid");
      expect(serialized).not.toContain("765432");
      expect(serialized).not.toContain("876543");
    }
  });

  it("excludes opponents' hidden victory points while playing, then shows final score", () => {
    const playingRoom = createRoom("playing");
    const playingView = projectRoomView(playingRoom, "seat-1");
    const playingOpponent = playingView.publicState.game!.players.find(({ playerId }) => playerId === "p2")!;
    const completeScore = calculatePlayerScore(playingRoom.matchState!.game, "p2");

    expect(playingOpponent.visibleScore).toBe(completeScore - 1);

    const lifecycleFinishedRoom = createRoom("playing");
    lifecycleFinishedRoom.lifecycle = "finished";
    const lifecycleFinishedOpponent = projectRoomView(
      lifecycleFinishedRoom,
      "seat-1"
    ).publicState.game!.players.find(({ playerId }) => playerId === "p2")!;
    expect(lifecycleFinishedOpponent.visibleScore).toBe(completeScore);

    const finishedRoom = createRoom("gameOver");
    const finishedView = projectRoomView(finishedRoom, "seat-1");
    const finishedOpponent = finishedView.publicState.game!.players.find(({ playerId }) => playerId === "p2")!;
    expect(finishedOpponent.visibleScore).toBe(
      calculatePlayerScore(finishedRoom.matchState!.game, "p2")
    );
    expect(JSON.stringify(finishedView.publicState)).not.toContain("opponent-hidden-vp-id");
    expect(JSON.stringify(finishedView.publicState)).not.toContain('"victoryPoint"');
  });

  it("allocates fresh nested objects and does not expose raw state by reference", () => {
    const room = createRoom();
    const first = projectRoomView(room, "seat-1");
    const second = projectRoomView(room, "seat-1");

    expect(first).not.toBe(second);
    expect(first.publicState).not.toBe(second.publicState);
    expect(first.publicState.game).not.toBe(room.matchState!.game);
    expect(first.publicState.game?.board).not.toBe(room.matchState!.game.board);
    expect(first.privateState.resources).not.toBe(room.matchState!.game.players[0].resources);
    expect(first.privateState.developmentCards).not.toBe(
      room.matchState!.game.players[0].developmentCards
    );
    expect(first.privateState.developmentCards?.[0]).not.toBe(
      room.matchState!.game.players[0].developmentCards[0]
    );
  });

  it("projects caller-specific setup targets without exposing another seat's choices", () => {
    const room = createRoom();
    room.matchState!.game = {
      ...room.matchState!.game,
      phase: "setup",
      activePlayerId: "p1",
      buildings: [],
      roads: [],
      setup: {
        order: ["p1", "p2", "p3", "p4", "p4", "p3", "p2", "p1"],
        placementIndex: 0,
        stage: "settlement"
      }
    };

    const active = projectRoomView(room, "seat-1").allowedActions!;
    const inactive = projectRoomView(room, "seat-2").allowedActions!;

    expect(active.setup.settlement.enabled).toBe(true);
    expect(active.setup.settlement.targets.length).toBeGreaterThan(0);
    expect(active.setup.road).toMatchObject({
      enabled: false,
      disabledReason: { code: "SETUP_SETTLEMENT_REQUIRED" }
    });
    expect(inactive.setup.settlement).toEqual({
      enabled: false,
      disabledReason: { code: "NOT_YOUR_TURN" },
      targets: []
    });
  });

  it("enables only the caller's seven discard and reports offline required players structurally", () => {
    const room = createRoom();
    const caller = projectRoomView(room, "seat-1", {
      connectedSeatIds: ["seat-1", "seat-3", "seat-4"]
    }).allowedActions!;
    const waiting = projectRoomView(room, "seat-3", {
      connectedSeatIds: ["seat-1", "seat-3", "seat-4"]
    }).allowedActions!;

    expect(caller.decisions.discard).toMatchObject({
      enabled: true,
      exactCount: 4,
      maxByResource: { wood: 1, brick: 2, wool: 3, grain: 4, ore: 5 }
    });
    expect(waiting.decisions.discard).toEqual({
      enabled: false,
      disabledReason: {
        code: "REQUIRED_PLAYER_OFFLINE",
        params: { playerIds: ["p2"] }
      },
      exactCount: 0,
      maxByResource: emptyResources(),
      targets: []
    });
    expect(waiting.turn.endTurn.disabledReason).toEqual({
      code: "REQUIRED_PLAYER_OFFLINE",
      params: { playerIds: ["p2"] }
    });
  });

  it("projects robber and pending development targets only for the required caller", () => {
    const room = createRoom();
    room.matchState!.game = {
      ...room.matchState!.game,
      turnState: {
        phase: "awaitingRobberPlacement",
        pendingDiscards: {},
        pendingRobber: {
          source: "seven",
          resumePhase: "action",
          eligibleVictimIds: []
        }
      }
    };
    const robber = projectRoomView(room, "seat-1").allowedActions!;
    expect(robber.decisions.robberHex.enabled).toBe(true);
    expect(robber.decisions.robberHex.targets).not.toContain(room.matchState!.game.robberHexId);

    room.matchState!.game.turnState = {
      phase: "awaitingRobberVictim",
      pendingDiscards: {},
      pendingRobber: {
        source: "seven",
        resumePhase: "action",
        targetHexId: room.matchState!.game.board[0].id,
        eligibleVictimIds: ["p2", "p4"]
      }
    };
    expect(
      projectRoomView(room, "seat-1").allowedActions!.decisions.robberVictim
    ).toMatchObject({ enabled: true, targets: ["p2", "p4"] });

    room.matchState!.game.turnState = {
      phase: "awaitingDevelopmentEffect",
      pendingDiscards: {},
      pendingDevelopmentEffect: {
        kind: "yearOfPlenty",
        playerId: "p1",
        remainingPicks: 2,
        resumePhase: "action"
      }
    };
    const development = projectRoomView(room, "seat-1").allowedActions!.decisions;
    expect(development.yearOfPlenty).toMatchObject({
      enabled: true,
      remainingPicks: 2,
      targets: resources
    });
    expect(
      projectRoomView(room, "seat-2").allowedActions!.decisions.yearOfPlenty
        .disabledReason
    ).toEqual({ code: "WAITING_FOR_ACTIVE_PLAYER", params: { playerId: "p1" } });

    room.matchState!.game.turnState = {
      phase: "awaitingDevelopmentEffect",
      pendingDiscards: {},
      pendingDevelopmentEffect: {
        kind: "roadBuilding",
        playerId: "p1",
        remainingRoads: 2,
        resumePhase: "action"
      }
    };
    const freeRoad = projectRoomView(room, "seat-1").allowedActions!.decisions.freeRoad;
    expect(freeRoad.remainingRoads).toBe(2);
    expect(freeRoad.targets.length).toBeGreaterThan(0);

    room.matchState!.game.turnState = {
      phase: "awaitingDevelopmentEffect",
      pendingDiscards: {},
      pendingDevelopmentEffect: {
        kind: "monopoly",
        playerId: "p1",
        resumePhase: "action"
      }
    };
    expect(
      projectRoomView(room, "seat-1").allowedActions!.decisions.monopoly
    ).toMatchObject({ enabled: true, targets: resources });
  });

  it("projects caller-only normal, trade, Commerce Guild, and sealed-bid capabilities", () => {
    const room = createRoom();
    room.matchState!.game.turnState = { phase: "awaitingRoll", pendingDiscards: {} };
    expect(projectRoomView(room, "seat-1").allowedActions!.turn.roll.enabled).toBe(
      true
    );
    expect(
      projectRoomView(room, "seat-2").allowedActions!.turn.roll.disabledReason
    ).toEqual({ code: "NOT_YOUR_TURN" });

    room.matchState!.game = {
      ...room.matchState!.game,
      turnState: { phase: "action", pendingDiscards: {} },
      players: room.matchState!.game.players.map((player) =>
        player.id === "p1"
          ? { ...player, vouchers: 3 }
          : player.id === "p3"
            ? { ...player, guildTokens: 3 }
            : player
      )
    };
    room.matchState!.guild = {
      ...room.matchState!.guild,
      gathering: {
        ...room.matchState!.guild.gathering,
        phase: "auction",
        auctionRound: 2
      }
    };

    const active = projectRoomView(room, "seat-1").allowedActions!;
    const bidder = projectRoomView(room, "seat-3").allowedActions!;

    expect(active.setup.settlement.disabledReason).toEqual({ code: "SETUP_NOT_ACTIVE" });
    expect(active.turn.endTurn.enabled).toBe(true);
    expect(active.turn.road.cost).toEqual({ wood: 1, brick: 1, wool: 0, grain: 0, ore: 0 });
    expect(active.maritime.ratios.wood).toBeGreaterThanOrEqual(2);
    expect(active.publicTrade.cancel.enabled).toBe(true);
    expect(active.publicTrade.accept.disabledReason).toEqual({ code: "CANNOT_ACCEPT_OWN_TRADE" });
    expect(active.commerce.transfer).toMatchObject({
      enabled: true,
      maxAmount: 900_001,
      recipientIds: ["p2", "p3", "p4"]
    });
    expect(active.commerce.redeemPrize.enabled).toBe(true);
    expect(active.sealedBid).toMatchObject({
      enabled: false,
      disabledReason: { code: "BID_ALREADY_SUBMITTED" },
      round: 2,
      maxAmount: 900_001,
      submitted: true
    });
    expect(bidder.sealedBid).toEqual({
      enabled: true,
      round: 2,
      maxAmount: 3,
      submitted: false
    });
    expect(JSON.stringify(bidder)).not.toContain("765432");
    expect(JSON.stringify(bidder)).not.toContain("876543");

    room.matchState!.guild = {
      ...room.matchState!.guild,
      gathering: {
        ...room.matchState!.guild.gathering,
        phase: "redemption",
        redemptions: { p1: 1 }
      }
    };
    const redemption = projectRoomView(room, "seat-1").allowedActions!.commerce;
    expect(redemption.tradeSlots.find(({ id }) => id === "ore-contract")?.enabled).toBe(true);
    expect(redemption.openAuction.enabled).toBe(true);
    expect(redemption.redeemGathering).toMatchObject({
      enabled: true,
      maxAmount: 3,
      targets: resources,
      bankStock: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 }
    });
  });

  it("gates public-trade cancellation and acceptance by authoritative turn facts", () => {
    const room = createRoom();
    const pendingStates: GameState["turnState"][] = [
      {
        phase: "awaitingDevelopmentEffect",
        pendingDiscards: {},
        pendingDevelopmentEffect: {
          kind: "monopoly",
          playerId: "p1",
          resumePhase: "action"
        }
      },
      {
        phase: "awaitingRobberPlacement",
        pendingDiscards: {},
        pendingRobber: {
          source: "seven",
          resumePhase: "action",
          eligibleVictimIds: []
        }
      }
    ];

    for (const turnState of pendingStates) {
      room.matchState!.game = { ...room.matchState!.game, turnState };
      expect(projectRoomView(room, "seat-1").allowedActions!.publicTrade.cancel).toMatchObject({
        enabled: false,
        disabledReason: { code: "REQUIRED_DECISION" }
      });
      expect(projectRoomView(room, "seat-2").allowedActions!.publicTrade.accept.enabled).toBe(
        false
      );
    }

    room.matchState!.game = {
      ...room.matchState!.game,
      phase: "gameOver",
      turnState: { phase: "action", pendingDiscards: {} }
    };
    expect(projectRoomView(room, "seat-1").allowedActions!.publicTrade.cancel).toMatchObject({
      enabled: false,
      disabledReason: { code: "GAME_OVER" }
    });
    expect(projectRoomView(room, "seat-2").allowedActions!.publicTrade.accept).toMatchObject({
      enabled: false,
      disabledReason: { code: "GAME_OVER" }
    });

    room.matchState!.game = {
      ...room.matchState!.game,
      phase: "playing",
      activePlayerId: "p2",
      turnState: { phase: "action", pendingDiscards: {} }
    };
    expect(projectRoomView(room, "seat-3").allowedActions!.publicTrade.accept).toMatchObject({
      enabled: false,
      disabledReason: { code: "PLAYER_TRADE_PROPOSER_NOT_ACTIVE" }
    });
  });

  it("does not expose proposer affordability through public-trade acceptance", () => {
    const room = createRoom();
    room.matchState!.game = {
      ...room.matchState!.game,
      turnState: { phase: "action", pendingDiscards: {} },
      players: room.matchState!.game.players.map((player) =>
        player.id === "p1"
          ? { ...player, resources: { ...player.resources, wood: 0 } }
          : player
      )
    };

    expect(projectRoomView(room, "seat-2").allowedActions!.publicTrade.accept.enabled).toBe(true);
    expect(() =>
      executeMatchCommandForTest(room.matchState!, {
        type: "ACCEPT_PLAYER_TRADE",
        playerId: "p2"
      })
    ).toThrow(/proposer.*afford/i);
  });
});
