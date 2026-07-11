import { describe, expect, it } from "vitest";

import { createCommerceGuild } from "../../src/domain/expansion/commerceGuild";
import { createDemoGame } from "../../src/domain/match/createMatch";
import type { MatchState } from "../../src/domain/match/types";
import { calculatePlayerScore } from "../../src/domain/rules/scoring";
import { emptyResources, type DevelopmentCard, type GameState } from "../../src/domain/types";
import {
  projectRoomView,
  type ProjectableRoomState
} from "../../src/online/projectRoomView";

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
      return { ...player, resources: emptyResources(), developmentCards: [] };
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
          winnerName: "Loss",
          bid: 4,
          round: 1,
          outcomeKind: "developmentCard",
          cardKind: "monopoly"
        }
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
    expect(serialized).not.toContain("monopoly");
    expect(view.publicState.submittedBidSeatIds).toEqual(["seat-1", "seat-2"]);
  });

  it("includes only the caller's private hand, decision, and unresolved bid amount", () => {
    const view = projectRoomView(createRoom(), "seat-1");

    expect(view.privateState).toEqual({
      seatId: "seat-1",
      playerId: "p1",
      seatTokenPresent: true,
      resources: { wood: 1, brick: 2, wool: 3, grain: 4, ore: 5 },
      developmentCards: [ownCard],
      ownPendingBid: 765_432,
      requiredDecision: { kind: "discardResources", count: 4 }
    });
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
        id: "blind-box-log",
        messageKey: "guild.auctionResolved",
        params: {
          winnerName: "Loss",
          bid: 4,
          round: 1,
          outcomeKind: "developmentCard"
        }
      },
      {
        id: "safe-log",
        messageKey: "dice.rolled",
        params: { playerName: "Voyage1969", total: 8, eventCount: 2 }
      }
    ]);
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
});
