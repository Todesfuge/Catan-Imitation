import { describe, expect, it, vi } from "vitest";

import { parseMapSeed, type MapSeed } from "../../src/domain/mapSeed";
import type { MatchExecutionContext } from "../../src/domain/match/types";
import type { PresenceEntry, ServerWebSocketMessage } from "../../src/online/protocol";
import { prepareCryptographicM1MapSeed } from "../../worker/crypto";
import {
  createCommandPipeline,
  type CommandMutationStore,
  type CommandRecipient,
  type LatestRoomMutation
} from "../../worker/room/commandPipeline";
import {
  RoomLifecycleError,
  createLobby,
  joinLobby,
  restartRoom,
  setLobbyReady,
  startLobby
} from "../../worker/room/roomLifecycle";
import type { LatestRoomMutationResult } from "../../worker/room/roomStore";
import type { PersistedRoom } from "../../worker/room/roomTypes";
import { prepareE2EExecutionContext } from "../../worker/testing/e2eExecutionContext";

const DAY_MS = 86_400_000;
const MAP_A = parseMapSeed("M1-0000000000000001");
const MAP_B = parseMapSeed("M1-0000000000000002");
const MAP_C = parseMapSeed("M1-0000000000000003");
const COMMAND_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003"
] as const;
const NO_PRESENCE: PresenceEntry[] = [];

function executionContext(seed = MAP_B): MatchExecutionContext {
  let logId = 0;
  return {
    random: { nextInt: () => 0 },
    nextMapSeed: () => seed,
    nextLogId: () => `restart-log-${++logId}`,
    now: () => 50_000
  };
}

function playingRoom(): PersistedRoom {
  let room = createLobby({
    roomCode: "ABC234",
    seatId: "seat-1",
    nickname: "Host",
    tokenHash: "A".repeat(43)
  }, 1_000);
  for (let index = 2; index <= 3; index += 1) {
    room = joinLobby(room, {
      seatId: `seat-${index}`,
      nickname: `Player ${index}`,
      tokenHash: String.fromCharCode(64 + index).repeat(43)
    }, 1_000 + index);
  }
  for (const seat of room.seats) {
    room = setLobbyReady(room, seat.seatId, true, 2_000 + seat.joinOrder);
  }
  const started = startLobby(room, room.hostSeatId, executionContext(MAP_A), 3_000);
  return {
    ...started,
    connectionTickets: [{ ticketHash: "T".repeat(43), seatId: "seat-2", expiresAt: 99_000 }],
    seats: started.seats.map((seat, index) => ({
      ...seat,
      acceptedCommandIds: [{
        commandId: `obsolete-command-${index + 1}`,
        resultingVersion: started.roomVersion
      }],
      commandAttemptTimestamps: [2_500 + index]
    }))
  };
}

type RestartScenario =
  | "setup"
  | "normal play"
  | "robber decision"
  | "development decision"
  | "player trade"
  | "sealed auction"
  | "finished game";

function scenarioRoom(scenario: RestartScenario): PersistedRoom {
  const room = playingRoom();
  if (scenario === "setup") return room;
  const matchState = room.matchState!;
  const { setup: _setup, ...withoutSetup } = matchState.game;
  const base: PersistedRoom = {
    ...room,
    matchState: {
      ...matchState,
      game: {
        ...withoutSetup,
        phase: "playing",
        activePlayerId: "p2",
        turn: 8,
        round: 3,
        turnState: {
          phase: "action",
          pendingDiscards: {},
          developmentCardPlayed: true
        },
        players: withoutSetup.players.map((player, index) => ({
          ...player,
          resources: { wood: index + 1, brick: 1, wool: 2, grain: 3, ore: 4 },
          guildTokens: index + 1
        })),
        buildings: [{
          id: "old-building",
          ownerId: "p1",
          vertexId: withoutSetup.board[0].vertexIds[0],
          kind: "settlement"
        }],
        roads: [{ id: "old-road", ownerId: "p1", edgeId: withoutSetup.edges[0].id }],
        log: [{ id: "old-log", message: "Old match" }]
      },
      lastDice: { first: 3, second: 4, total: 7 }
    }
  };

  if (scenario === "robber decision") {
    return {
      ...base,
      matchState: {
        ...base.matchState!,
        game: {
          ...base.matchState!.game,
          turnState: {
            phase: "awaitingRobberVictim",
            pendingDiscards: { p3: 4 },
            pendingRobber: {
              source: "seven",
              resumePhase: "action",
              targetHexId: base.matchState!.game.board[1].id,
              eligibleVictimIds: ["p3"]
            }
          }
        }
      }
    };
  }
  if (scenario === "development decision") {
    return {
      ...base,
      matchState: {
        ...base.matchState!,
        game: {
          ...base.matchState!.game,
          turnState: {
            phase: "awaitingDevelopmentEffect",
            pendingDiscards: {},
            pendingDevelopmentEffect: {
              kind: "monopoly",
              playerId: "p2",
              resumePhase: "action"
            },
            developmentCardPlayed: true
          }
        }
      }
    };
  }
  if (scenario === "player trade") {
    return {
      ...base,
      matchState: {
        ...base.matchState!,
        pendingPlayerTrade: {
          proposerId: "p2",
          offered: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
          requested: { wood: 0, brick: 0, wool: 0, grain: 0, ore: 1 }
        }
      }
    };
  }
  if (scenario === "sealed auction") {
    return {
      ...base,
      matchState: {
        ...base.matchState!,
        guild: {
          ...base.matchState!.guild,
          gathering: {
            ...base.matchState!.guild.gathering,
            phase: "auction",
            auctionRound: 4
          }
        }
      },
      pendingAuction: { round: 4, bidsBySeatId: { "seat-1": 2, "seat-3": 0 } }
    };
  }
  if (scenario === "finished game") {
    return {
      ...base,
      lifecycle: "finished",
      matchState: {
        ...base.matchState!,
        game: { ...base.matchState!.game, phase: "gameOver", winnerId: "p2" }
      }
    };
  }
  return base;
}

function restartCommand(commandId: string, expectedVersion: number, mode: "fresh" | "sameMap") {
  return JSON.stringify({ type: "room.restart", commandId, expectedVersion, mode });
}

function restartAttemptId(index: number): string {
  return `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

class MemoryCommandStore implements CommandMutationStore {
  commits = 0;
  calls = 0;

  constructor(public room: PersistedRoom | null) {}

  async mutateLatest<T>(
    _now: number,
    mutation: (room: PersistedRoom) => LatestRoomMutation<T>
  ): Promise<LatestRoomMutationResult<T>> {
    this.calls += 1;
    if (this.room === null) return { kind: "missing" };
    const result = mutation(structuredClone(this.room));
    if (result.kind === "updated") {
      this.room = structuredClone(result.room);
      this.commits += 1;
    }
    return { kind: "active", room: structuredClone(this.room), value: result.value };
  }
}

class SerializedCommandStore extends MemoryCommandStore {
  private tail: Promise<void> = Promise.resolve();

  override async mutateLatest<T>(
    now: number,
    mutation: (room: PersistedRoom) => LatestRoomMutation<T>
  ): Promise<LatestRoomMutationResult<T>> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await super.mutateLatest(now, mutation);
    } finally {
      release();
    }
  }
}

class RetryingCommandStore extends MemoryCommandStore {
  readonly candidates: PersistedRoom[] = [];

  override async mutateLatest<T>(
    _now: number,
    mutation: (room: PersistedRoom) => LatestRoomMutation<T>
  ): Promise<LatestRoomMutationResult<T>> {
    if (this.room === null) return { kind: "missing" };
    const current = structuredClone(this.room);
    const first = mutation(structuredClone(current));
    if (first.kind === "unchanged") {
      return { kind: "active", room: structuredClone(this.room), value: first.value };
    }

    const second = mutation(structuredClone(current));
    if (second.kind !== "updated") throw new Error("retry changed the mutation kind");
    this.candidates.push(structuredClone(first.room), structuredClone(second.room));
    this.room = structuredClone(second.room);
    this.commits += 1;
    return { kind: "active", room: structuredClone(this.room), value: second.value };
  }
}

function recipientSet(...seatIds: string[]): {
  recipients: CommandRecipient[];
  messages: Map<string, ServerWebSocketMessage[]>;
} {
  const messages = new Map<string, ServerWebSocketMessage[]>();
  return {
    messages,
    recipients: seatIds.map((seatId) => ({
      seatId,
      send(message) {
        const current = messages.get(seatId) ?? [];
        current.push(message);
        messages.set(seatId, current);
      }
    }))
  };
}

function pipelineFor(store: CommandMutationStore, seed = MAP_B, audit = vi.fn()) {
  return createCommandPipeline({
    store,
    audit,
    prepareExecutionContext: (now) => () => ({ ...executionContext(seed), now: () => now })
  });
}

describe("authoritative room restart lifecycle", () => {
  it.each([
    "setup",
    "normal play",
    "robber decision",
    "development decision",
    "player trade",
    "sealed auction",
    "finished game"
  ] as const)("resets %s completely in both restart modes", (scenario) => {
    for (const mode of ["sameMap", "fresh"] as const) {
      const room = scenarioRoom(scenario);
      const original = structuredClone(room);
      const restarted = restartRoom(room, "seat-1", mode, executionContext(MAP_B), 50_000);
      const expectedSeed = mode === "sameMap" ? MAP_A : MAP_B;

      expect(room).toEqual(original);
      expect(restarted).toMatchObject({
        schemaVersion: 2,
        roomCode: room.roomCode,
        lifecycle: "playing",
        hostSeatId: room.hostSeatId,
        nextJoinOrder: room.nextJoinOrder,
        roomVersion: room.roomVersion + 1,
        createdAt: room.createdAt,
        lastActivityAt: 50_000,
        expiresAt: 50_000 + DAY_MS
      });
      expect(restarted.connectionTickets).toEqual(room.connectionTickets);
      expect(restarted.seats).toEqual(room.seats.map((seat) => ({
        ...seat,
        acceptedCommandIds: []
      })));
      expect(restarted.matchState!.game.players.map(({ id, name, color }) => ({ id, name, color })))
        .toEqual(room.matchState!.game.players.map(({ id, name, color }) => ({ id, name, color })));
      expect(restarted.matchState).toMatchObject({
        game: {
          mapSeed: expectedSeed,
          phase: "setup",
          activePlayerId: "p1",
          turn: 1,
          round: 1,
          buildings: [],
          roads: [],
          setup: { placementIndex: 0, stage: "settlement" }
        },
        lastDice: null,
        guild: { usedTradePlayerIds: [], gathering: { phase: "idle" } }
      });
      expect(restarted).not.toHaveProperty("pendingAuction");
      expect(restarted.matchState).not.toHaveProperty("pendingPlayerTrade");
      expect(restarted.matchState!.game).not.toHaveProperty("winnerId");
      expect(restarted.matchState!.game.turnState).not.toHaveProperty("pendingRobber");
      expect(restarted.matchState!.game.turnState).not.toHaveProperty("pendingDevelopmentEffect");
      for (const player of restarted.matchState!.game.players) {
        expect(player.resources).toEqual({ wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 });
        expect(player.developmentCards).toEqual([]);
      }
    }
  });

  it.each([
    ["non-host", () => playingRoom(), "seat-2", "HOST_ONLY"],
    ["unknown seat", () => playingRoom(), "seat-missing", "SEAT_NOT_FOUND"],
    ["lobby", () => createLobby({
      roomCode: "ABC234", seatId: "seat-1", nickname: "Host", tokenHash: "A".repeat(43)
    }, 1_000), "seat-1", "ROOM_ALREADY_STARTED"],
    ["missing match", () => ({ ...playingRoom(), matchState: undefined }), "seat-1", "ROOM_ALREADY_STARTED"]
  ] as const)("rejects %s without mutating the input", (_name, createRoom, seatId, code) => {
    const room = createRoom();
    const original = structuredClone(room);

    expect(() => restartRoom(room, seatId, "fresh", executionContext(), 50_000))
      .toThrowError(expect.objectContaining({ code }));
    expect(room).toEqual(original);
  });

  it("rejects malformed Worker seed context without mutating the input", () => {
    const room = playingRoom();
    const original = structuredClone(room);
    const malformed = {
      ...executionContext(),
      nextMapSeed: () => "client-controlled-seed" as MapSeed
    };

    expect(() => restartRoom(room, "seat-1", "fresh", malformed, 50_000)).toThrow(TypeError);
    expect(room).toEqual(original);
  });
});

describe("room restart command pipeline", () => {
  it("deduplicates restart before version comparison and retains only the current acknowledgement", async () => {
    const room = playingRoom();
    const store = new MemoryCommandStore(room);
    const peers = recipientSet("seat-1", "seat-2", "seat-3");
    const pipeline = pipelineFor(store);
    const rawMessage = restartCommand(COMMAND_IDS[0], room.roomVersion, "sameMap");

    await pipeline.handle({
      seatId: "seat-1", rawMessage, now: 50_000,
      presence: NO_PRESENCE, recipients: peers.recipients
    });
    await pipeline.handle({
      seatId: "seat-1", rawMessage, now: 50_001,
      presence: NO_PRESENCE, recipients: peers.recipients
    });

    expect(store.commits).toBe(1);
    expect(store.room!.roomVersion).toBe(room.roomVersion + 1);
    expect(store.room!.seats.map((seat) => seat.acceptedCommandIds)).toEqual([
      [{ commandId: COMMAND_IDS[0], resultingVersion: room.roomVersion + 1 }],
      [],
      []
    ]);
    expect(peers.messages.get("seat-1")).toHaveLength(2);
    expect(peers.messages.get("seat-2")).toHaveLength(1);
    expect(peers.messages.get("seat-3")).toHaveLength(1);
  });

  it("rejects a stale restart without resetting the match", async () => {
    const room = scenarioRoom("normal play");
    const store = new MemoryCommandStore(structuredClone(room));
    const peers = recipientSet("seat-1", "seat-2");

    await pipelineFor(store).handle({
      seatId: "seat-1",
      rawMessage: restartCommand(COMMAND_IDS[0], room.roomVersion - 1, "fresh"),
      now: 50_000,
      presence: NO_PRESENCE,
      recipients: peers.recipients
    });

    expect(store.commits).toBe(0);
    expect(store.room).toEqual(room);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected",
      error: { code: "VERSION_CONFLICT" },
      snapshot: { roomVersion: room.roomVersion }
    });
    expect(peers.messages.has("seat-2")).toBe(false);
  });

  it("rate-limits failed restarts without persisting room admission state", async () => {
    const room = scenarioRoom("normal play");
    const original = structuredClone(room);
    const store = new MemoryCommandStore(structuredClone(room));
    const peers = recipientSet("seat-1", "seat-2");
    const pipeline = createCommandPipeline({
      store,
      audit: vi.fn(),
      rateLimit: { maximum: 3, windowMs: 2_000 },
      prepareExecutionContext: () => () => executionContext(MAP_B)
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await pipeline.handle({
        seatId: "seat-2",
        rawMessage: restartCommand(restartAttemptId(attempt), room.roomVersion, "fresh"),
        now: 50_000 + attempt,
        presence: NO_PRESENCE,
        recipients: peers.recipients
      });

      expect(store.commits).toBe(0);
      expect(store.room).toEqual(original);
      expect(peers.messages.get("seat-2")?.at(-1)).toMatchObject({
        type: "command.rejected",
        error: { code: attempt < 3 ? "COMMAND_NOT_ALLOWED" : "RATE_LIMITED" }
      });
      expect(peers.messages.has("seat-1")).toBe(false);
    }
  });

  it("shares one rate budget between failed restarts and ordinary commands", async () => {
    const room = createLobby({
      roomCode: "ABC234",
      seatId: "seat-1",
      nickname: "Host",
      tokenHash: "A".repeat(43)
    }, 1_000);
    const original = structuredClone(room);
    const store = new MemoryCommandStore(structuredClone(room));
    const peers = recipientSet("seat-1");
    const pipeline = createCommandPipeline({
      store,
      audit: vi.fn(),
      rateLimit: { maximum: 3, windowMs: 2_000 }
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await pipeline.handle({
        seatId: "seat-1",
        rawMessage: restartCommand(restartAttemptId(attempt), room.roomVersion, "fresh"),
        now: 50_000 + attempt,
        presence: NO_PRESENCE,
        recipients: peers.recipients
      });
      expect(store.commits).toBe(0);
      expect(store.room).toEqual(original);
      expect(peers.messages.get("seat-1")?.at(-1)).toMatchObject({
        type: "command.rejected",
        error: { code: "COMMAND_NOT_ALLOWED" }
      });
    }

    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: JSON.stringify({
        type: "room.ready",
        commandId: COMMAND_IDS[0],
        expectedVersion: room.roomVersion,
        ready: true
      }),
      now: 50_002,
      presence: NO_PRESENCE,
      recipients: peers.recipients
    });

    expect(store.commits).toBe(1);
    expect(store.room!.seats[0]).toMatchObject({
      ready: true,
      commandAttemptTimestamps: [50_002]
    });
    expect(peers.messages.get("seat-1")?.at(-1)).toMatchObject({
      type: "room.snapshot",
      acknowledgedCommandId: COMMAND_IDS[0]
    });

    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: JSON.stringify({
        type: "room.ready",
        commandId: COMMAND_IDS[1],
        expectedVersion: store.room!.roomVersion,
        ready: false
      }),
      now: 50_003,
      presence: NO_PRESENCE,
      recipients: peers.recipients
    });

    expect(store.commits).toBe(1);
    expect(store.room!.seats[0]).toMatchObject({
      ready: true,
      commandAttemptTimestamps: [50_002]
    });
    expect(peers.messages.get("seat-1")?.at(-1)).toMatchObject({
      type: "command.rejected",
      commandId: COMMAND_IDS[1],
      error: { code: "RATE_LIMITED" }
    });
  });

  it("serializes two concurrent host restarts so only one reset and seed commit", async () => {
    const room = scenarioRoom("normal play");
    const store = new SerializedCommandStore(room);
    const firstPeers = recipientSet("seat-1", "seat-2", "seat-3");
    const secondPeers = recipientSet("seat-1", "seat-2", "seat-3");
    const seeds = [MAP_B, MAP_C];
    const pipeline = createCommandPipeline({
      store,
      audit: vi.fn(),
      prepareExecutionContext: (now) => {
        const seed = seeds.shift()!;
        return () => ({ ...executionContext(seed), now: () => now });
      }
    });

    await Promise.all([
      pipeline.handle({
        seatId: "seat-1",
        rawMessage: restartCommand(COMMAND_IDS[0], room.roomVersion, "fresh"),
        now: 50_000,
        presence: NO_PRESENCE,
        recipients: firstPeers.recipients
      }),
      pipeline.handle({
        seatId: "seat-1",
        rawMessage: restartCommand(COMMAND_IDS[1], room.roomVersion, "fresh"),
        now: 50_001,
        presence: NO_PRESENCE,
        recipients: secondPeers.recipients
      })
    ]);

    expect(store.room!.roomVersion).toBe(room.roomVersion + 1);
    expect([MAP_B, MAP_C]).toContain(store.room!.matchState!.game.mapSeed);
    const allMessages = [
      ...[...firstPeers.messages.values()].flat(),
      ...[...secondPeers.messages.values()].flat()
    ];
    expect(allMessages.filter((message) => message.type === "room.snapshot" &&
      message.acknowledgedCommandId !== undefined)).toHaveLength(3);
    expect(allMessages.filter((message) => message.type === "command.rejected" &&
      message.error.code === "VERSION_CONFLICT")).toHaveLength(1);
  });

  it("retries the real E2E execution context with byte-equivalent candidates", async () => {
    const room = scenarioRoom("normal play");
    const store = new RetryingCommandStore(room);
    const peers = recipientSet("seat-1", "seat-2", "seat-3");
    const pipeline = createCommandPipeline({
      store,
      audit: vi.fn(),
      rateLimit: { maximum: 1, windowMs: 2_000 },
      prepareExecutionContextForRoom: prepareE2EExecutionContext
    });

    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: restartCommand(COMMAND_IDS[0], room.roomVersion, "fresh"),
      now: 50_000,
      presence: NO_PRESENCE,
      recipients: peers.recipients
    });

    expect(store.candidates).toHaveLength(2);
    expect(store.candidates[0]).toEqual(store.candidates[1]);
    expect(store.room!.matchState).toMatchObject({
      game: {
        mapSeed: `M1-000000000000000${room.roomVersion}`,
        phase: "setup",
        log: [
          { id: `e2e-log-${room.roomVersion}-1`, messageKey: "setup.newGameStarted" },
          { id: "log-setup", messageKey: "setup.started" }
        ]
      }
    });
    expect(store.commits).toBe(1);
    expect([...peers.messages.values()].flat()).toHaveLength(3);
  });

  it("broadcasts one complete caller-specific v2 setup snapshot per live seat and audits room.restart", async () => {
    const room = scenarioRoom("sealed auction");
    const store = new MemoryCommandStore(room);
    const peers = recipientSet("seat-1", "seat-2", "seat-3");
    const audit = vi.fn();

    await pipelineFor(store, MAP_B, audit).handle({
      seatId: "seat-1",
      rawMessage: restartCommand(COMMAND_IDS[0], room.roomVersion, "fresh"),
      now: 50_000,
      presence: [
        { seatId: "seat-1", connectionCount: 1, online: true },
        { seatId: "seat-2", connectionCount: 1, online: true },
        { seatId: "seat-3", connectionCount: 1, online: true }
      ],
      recipients: peers.recipients
    });

    for (const seatId of ["seat-1", "seat-2", "seat-3"]) {
      expect(peers.messages.get(seatId)).toHaveLength(1);
      expect(peers.messages.get(seatId)?.[0]).toMatchObject({
        type: "room.snapshot",
        schemaVersion: 2,
        roomVersion: room.roomVersion + 1,
        lifecycle: "playing",
        acknowledgedCommandId: COMMAND_IDS[0],
        publicState: { game: { mapSeed: MAP_B, phase: "setup" }, submittedBidSeatIds: [] },
        privateState: {
          seatId,
          canRestartMatch: seatId === "seat-1",
          resources: { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
          developmentCards: []
        }
      });
    }
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      event: "room.command",
      commandType: "room.restart",
      roomVersion: room.roomVersion + 1
    }));
  });

  it("does not persist or broadcast when restart projection preflight fails", async () => {
    const room = scenarioRoom("normal play");
    const store = new MemoryCommandStore(structuredClone(room));
    const peers = recipientSet("seat-1", "seat-2", "seat-3");
    const pipeline = createCommandPipeline({
      store,
      audit: vi.fn(),
      prepareExecutionContext: () => () => executionContext(MAP_B),
      projectRoom() { throw new Error("private projection detail"); }
    });

    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: restartCommand(COMMAND_IDS[0], room.roomVersion, "fresh"),
      now: 50_000,
      presence: NO_PRESENCE,
      recipients: peers.recipients
    });

    expect(store.commits).toBe(0);
    expect(store.room).toEqual(room);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected",
      error: { code: "INTERNAL_ERROR" }
    });
    expect(JSON.stringify(peers.messages.get("seat-1"))).not.toContain("private projection detail");
    expect(peers.messages.has("seat-2")).toBe(false);
    expect(peers.messages.has("seat-3")).toBe(false);
  });

  it("maps malformed restart context to a safe rejection without persistence", async () => {
    const room = scenarioRoom("normal play");
    const store = new MemoryCommandStore(structuredClone(room));
    const peers = recipientSet("seat-1", "seat-2");
    const pipeline = createCommandPipeline({
      store,
      audit: vi.fn(),
      prepareExecutionContext: () => () => ({
        ...executionContext(),
        nextMapSeed: () => "malformed-worker-seed" as MapSeed
      })
    });

    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: restartCommand(COMMAND_IDS[0], room.roomVersion, "fresh"),
      now: 50_000,
      presence: NO_PRESENCE,
      recipients: peers.recipients
    });

    expect(store.commits).toBe(0);
    expect(store.room).toEqual(room);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected",
      error: { code: "INTERNAL_ERROR", params: {} }
    });
    expect(peers.messages.has("seat-2")).toBe(false);
  });

  it("contains preparation failures after authentication without persistence or broadcast", async () => {
    const room = scenarioRoom("normal play");
    const store = new MemoryCommandStore(structuredClone(room));
    const peers = recipientSet("seat-1", "seat-2");
    const audit = vi.fn();
    const secret = "private preparation entropy detail";
    const pipeline = createCommandPipeline({
      store,
      audit,
      prepareExecutionContext() { throw new Error(secret); }
    });

    await expect(pipeline.handle({
      seatId: "seat-1",
      rawMessage: restartCommand(COMMAND_IDS[0], room.roomVersion, "fresh"),
      now: 50_000,
      presence: NO_PRESENCE,
      recipients: peers.recipients
    })).resolves.toBeUndefined();

    expect(store.calls).toBe(1);
    expect(store.commits).toBe(0);
    expect(store.room).toEqual(room);
    expect(peers.messages.get("seat-1")).toEqual([{
      type: "command.rejected",
      commandId: COMMAND_IDS[0],
      error: { code: "INTERNAL_ERROR", params: {}, retryable: true }
    }]);
    expect(peers.messages.has("seat-2")).toBe(false);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      commandType: "room.restart",
      roomVersion: room.roomVersion,
      errorCode: "INTERNAL_ERROR"
    }));
    expect(JSON.stringify({
      messages: peers.messages.get("seat-1"),
      audit: audit.mock.calls
    })).not.toContain(secret);
  });

  it.each([
    ["non-host", () => scenarioRoom("normal play"), "seat-2"],
    ["lobby", () => createLobby({
      roomCode: "ABC234", seatId: "seat-1", nickname: "Host", tokenHash: "A".repeat(43)
    }, 1_000), "seat-1"],
    ["missing match", () => ({ ...playingRoom(), matchState: undefined }), "seat-1"]
  ] as const)("rejects %s restart through safe command mapping without persisting", async (
    _name,
    createRoom,
    seatId
  ) => {
    const room = createRoom();
    const store = new MemoryCommandStore(structuredClone(room));
    const peers = recipientSet(seatId, "seat-1");

    await pipelineFor(store).handle({
      seatId,
      rawMessage: restartCommand(COMMAND_IDS[0], room.roomVersion, "fresh"),
      now: 50_000,
      presence: NO_PRESENCE,
      recipients: peers.recipients
    });

    expect(store.commits).toBe(0);
    expect(store.room).toEqual(room);
    expect(peers.messages.get(seatId)?.[0]).toMatchObject({
      type: "command.rejected",
      error: { code: "COMMAND_NOT_ALLOWED" }
    });
  });

  it("rejects client seed and authority fields before authenticated mutation", async () => {
    const store = new MemoryCommandStore(playingRoom());
    const peers = recipientSet("seat-1");
    const pipeline = pipelineFor(store);
    const attempts = [
      { seed: MAP_B },
      { actorId: "p1" },
      { seatId: "seat-1" },
      { hostSeatId: "seat-1" }
    ];

    for (const extra of attempts) {
      await pipeline.handle({
        seatId: "seat-1",
        rawMessage: JSON.stringify({
          type: "room.restart",
          commandId: COMMAND_IDS[0],
          expectedVersion: store.room!.roomVersion,
          mode: "fresh",
          ...extra
        }),
        now: 50_000,
        presence: NO_PRESENCE,
        recipients: peers.recipients
      });
    }

    expect(store.commits).toBe(0);
    expect(peers.messages.get("seat-1")?.every((message) =>
      message.type === "protocol.incompatible")).toBe(true);
  });
});

describe("prepared restart entropy", () => {
  it("formats a cryptographic M1 seed from a dedicated eight-byte draw", () => {
    const targets: number[][] = [];
    const seed = prepareCryptographicM1MapSeed((target) => {
      targets.push([...target]);
      target.set([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
    });

    expect(targets).toEqual([[0, 0, 0, 0, 0, 0, 0, 0]]);
    expect(seed).toBe("M1-0123456789ABCDEF");
  });

  it("derives E2E map seeds by room version independently of hidden draws", () => {
    const first = prepareE2EExecutionContext(50_000)(7);
    const second = prepareE2EExecutionContext(50_000)(8);
    const firstSeed = first.nextMapSeed();

    first.random.nextInt(6);
    first.random.nextInt(6);
    first.random.nextInt(17);

    expect(firstSeed).toBe("M1-0000000000000007");
    expect(first.nextMapSeed()).toBe(firstSeed);
    expect(second.nextMapSeed()).toBe("M1-0000000000000008");
  });
});
