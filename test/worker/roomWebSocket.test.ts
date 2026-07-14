import { describe, expect, it, vi } from "vitest";

import { RuleViolationError } from "../../src/domain/errors";
import { parseMapSeed } from "../../src/domain/mapSeed";
import { applyMatchCommand } from "../../src/domain/match/applyMatchCommand";
import type { MatchCommand, MatchExecutionContext, MatchState } from "../../src/domain/match/types";
import { MAX_WIRE_BYTES, type PresenceEntry, type ServerWebSocketMessage } from "../../src/online/protocol";
import {
  createCommandPipeline,
  type CommandMutationStore,
  type CommandRecipient,
  type LatestRoomMutation
} from "../../worker/room/commandPipeline";
import { createLobby, joinLobby, setLobbyReady, startLobby } from "../../worker/room/roomLifecycle";
import type { PersistedRoom } from "../../worker/room/roomTypes";
import { RoomDurableObject, sendWebSocketMessage } from "../../worker/room/RoomDurableObject";
import type { Env } from "../../worker/env";
import { RoomStore, type LatestRoomMutationResult, type RoomStorage } from "../../worker/room/roomStore";

const ids = Array.from({ length: 80 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);

const context: MatchExecutionContext = {
  random: { nextInt: () => 0 },
  nextMapSeed: () => parseMapSeed("M1-0000000000000002"),
  nextLogId: () => "log-id",
  now: () => 1_000
};

function lobbyRoom(): PersistedRoom {
  let room = createLobby({ roomCode: "234567", seatId: "seat-1", nickname: "One", tokenHash: "A".repeat(43) }, 1);
  room = joinLobby(room, { seatId: "seat-2", nickname: "Two", tokenHash: "B".repeat(43) }, 2);
  return room;
}

function playingRoom(): PersistedRoom {
  let room = lobbyRoom();
  room = joinLobby(room, { seatId: "seat-3", nickname: "Three", tokenHash: "C".repeat(43) }, 3);
  for (const seat of room.seats) room = setLobbyReady(room, seat.seatId, true, 10 + seat.joinOrder);
  return startLobby(room, "seat-1", context, 20);
}

function auctionRoom(tokens = [3, 2, 1]): PersistedRoom {
  const room = playingRoom();
  const { setup: _setup, ...game } = room.matchState!.game;
  return {
    ...room,
    matchState: {
      ...room.matchState!,
      game: {
        ...game,
        phase: "playing",
        players: room.matchState!.game.players.map((player, index) => ({
          ...player,
          guildTokens: tokens[index] ?? 0
        }))
      },
      guild: {
        ...room.matchState!.guild,
        gathering: {
          ...room.matchState!.guild.gathering,
          phase: "auction",
          auctionRound: 1
        }
      }
    }
  };
}

function bid(commandId: string, expectedVersion: number, amount: number): string {
  return JSON.stringify({ type: "auction.submitBid", commandId, expectedVersion, amount });
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
    if (this.room === null) return { kind: "missing" } as const;
    const result = mutation(structuredClone(this.room));
    if (result.kind === "updated") {
      this.room = structuredClone(result.room);
      this.commits += 1;
    }
    return { kind: "active", value: result.value, room: structuredClone(this.room) } as const;
  }
}

function recipients(...seatIds: string[]): {
  recipients: CommandRecipient[];
  messages: Map<string, ServerWebSocketMessage[]>;
  closes: Map<string, Array<{ code: number; reason: string }>>;
} {
  const messages = new Map<string, ServerWebSocketMessage[]>();
  const closes = new Map<string, Array<{ code: number; reason: string }>>();
  return {
    messages,
    closes,
    recipients: seatIds.map((seatId) => ({
      seatId,
      send(message) {
        const entries = messages.get(seatId) ?? [];
        entries.push(message);
        messages.set(seatId, entries);
      },
      close(code, reason) {
        const entries = closes.get(seatId) ?? [];
        entries.push({ code, reason });
        closes.set(seatId, entries);
      }
    }))
  };
}

function command(commandId: string, expectedVersion: number, ready = true): string {
  return JSON.stringify({ type: "room.ready", commandId, expectedVersion, ready });
}

const noPresence: PresenceEntry[] = [];

describe("authoritative room command pipeline", () => {
  it("drops oversized UTF-8 messages at the shared outbound socket boundary", () => {
    const sent: string[] = [];
    const socket = { send: (value: string) => sent.push(value) } as unknown as WebSocket;
    const small: ServerWebSocketMessage = { type: "presence.changed", presence: [] };
    const snapshot = {
      type: "room.snapshot",
      schemaVersion: 3,
      roomVersion: 1,
      lifecycle: "lobby",
      publicState: {},
      privateState: { padding: "" },
      allowedActions: {},
      presence: []
    } as ServerWebSocketMessage;
    const emptyBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
    const exact = {
      ...snapshot,
      privateState: { padding: "x".repeat(MAX_WIRE_BYTES - emptyBytes) }
    } as ServerWebSocketMessage;
    const oversized = {
      ...snapshot,
      privateState: { padding: "界".repeat(6_000) }
    } as ServerWebSocketMessage;

    expect(sendWebSocketMessage(socket, small)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(exact))).toHaveLength(MAX_WIRE_BYTES);
    expect(sendWebSocketMessage(socket, exact)).toBe(true);
    expect(sendWebSocketMessage(socket, oversized)).toBe(false);
    expect(sent).toEqual([JSON.stringify(small), JSON.stringify(exact)]);
  });

  it("emits only bounded structured audit fields and skips heartbeats", async () => {
    const room = lobbyRoom();
    const store = new MemoryCommandStore(room);
    const peers = recipients("seat-1");
    const audit = vi.fn();
    const pipeline = createCommandPipeline({ store, audit });

    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: JSON.stringify({ type: "connection.heartbeat", schemaVersion: 1 }),
      now: 90,
      presence: noPresence,
      recipients: peers.recipients
    });
    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: command(ids[0], room.roomVersion),
      now: 100,
      presence: noPresence,
      recipients: peers.recipients
    });

    expect(audit).toHaveBeenCalledTimes(1);
    const record = audit.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual([
      "commandType", "durationMs", "event", "roomHashPrefix", "roomVersion"
    ]);
    expect(record).toMatchObject({
      event: "room.command",
      commandType: "room.ready",
      roomVersion: room.roomVersion + 1
    });
    expect(record.roomHashPrefix).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(record.durationMs).toEqual(expect.any(Number));
    const serialized = JSON.stringify(record);
    for (const forbidden of [room.roomCode, "One", "token", "ticket", "payload", "amount", ids[0]]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("audits rate limits and internal failures with stable generic codes only", async () => {
    const limitedRoom = lobbyRoom();
    limitedRoom.seats[0].commandAttemptTimestamps = Array.from({ length: 10 }, () => 100);
    const limitedAudit = vi.fn();
    const limitedPeers = recipients("seat-1");
    await createCommandPipeline({ store: new MemoryCommandStore(limitedRoom), audit: limitedAudit }).handle({
      seatId: "seat-1", rawMessage: command(ids[0], limitedRoom.roomVersion), now: 101,
      presence: noPresence, recipients: limitedPeers.recipients
    });
    expect(limitedAudit.mock.calls[0][0]).toMatchObject({ errorCode: "RATE_LIMITED" });
    expect(limitedPeers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected", error: { code: "RATE_LIMITED" }
    });

    const failingAudit = vi.fn();
    const failingPeers = recipients("seat-1");
    const secret = "private exception with token and stack";
    const failingRoom = lobbyRoom();
    await createCommandPipeline({
      store: new MemoryCommandStore(failingRoom),
      audit: failingAudit,
      createExecutionContext: () => { throw new Error(secret); }
    }).handle({
      seatId: "seat-1", rawMessage: command(ids[1], failingRoom.roomVersion), now: 200,
      presence: noPresence, recipients: failingPeers.recipients
    });
    expect(failingAudit.mock.calls[0][0]).toMatchObject({ errorCode: "INTERNAL_ERROR" });
    expect(JSON.stringify(failingAudit.mock.calls[0][0])).not.toContain(secret);
    expect(failingPeers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected", error: { code: "INTERNAL_ERROR", params: {} }
    });
  });

  it("rejects unknown, oversized, malformed, and actor-bearing wire messages before mutation", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    const peers = recipients("seat-1");
    const pipeline = createCommandPipeline({ store });
    const invalid = [
      JSON.stringify({ type: "match.unknown" }),
      "x".repeat(MAX_WIRE_BYTES + 1),
      "{",
      JSON.stringify({
        type: "match.command", commandId: ids[0], expectedVersion: store.room!.roomVersion,
        playerId: "player-2", command: { type: "ROLL_DICE" }
      })
    ];

    for (const rawMessage of invalid) {
      await pipeline.handle({ seatId: "seat-1", rawMessage, now: 100, presence: noPresence, recipients: peers.recipients });
    }

    expect(store.commits).toBe(0);
    expect(store.calls).toBe(0);
    expect(peers.messages.get("seat-1")).toHaveLength(4);
    expect(peers.messages.get("seat-1")!.every((message) =>
      message.type === "protocol.incompatible" && message.error.code === "PROTOCOL_INCOMPATIBLE"
    )).toBe(true);
  });

  it("revalidates the attached seat against the latest persisted room", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    const peers = recipients("removed-seat");
    const pipeline = createCommandPipeline({ store });

    await pipeline.handle({
      seatId: "removed-seat", rawMessage: command(ids[0], store.room!.roomVersion), now: 100,
      presence: noPresence, recipients: peers.recipients
    });

    expect(store.commits).toBe(0);
    expect(peers.messages.get("removed-seat")?.[0]).toMatchObject({
      type: "command.rejected", error: { code: "COMMAND_NOT_ALLOWED" }
    });
  });

  it("derives the trusted actor only from the persisted seat", async () => {
    const room = playingRoom();
    const store = new MemoryCommandStore(room);
    const peers = recipients("seat-2");
    const executed: MatchCommand[] = [];
    const pipeline = createCommandPipeline({
      store,
      createExecutionContext: () => context,
      executeMatchCommand(state, trustedCommand) {
        executed.push(trustedCommand);
        return state;
      }
    });

    await pipeline.handle({
      seatId: "seat-2",
      rawMessage: JSON.stringify({
        type: "match.command", commandId: ids[0], expectedVersion: room.roomVersion,
        command: { type: "TRANSFER_TOKENS", toPlayerId: room.seats[0].playerId, amount: 0 }
      }),
      now: 100, presence: noPresence, recipients: peers.recipients
    });

    expect(executed[0]).toEqual({
      type: "TRANSFER_TOKENS",
      fromPlayerId: room.seats[1].playerId,
      toPlayerId: room.seats[0].playerId,
      amount: 0
    });
  });

  it("uses a server-owned execution context and maps actorless shared commands", async () => {
    const room = playingRoom();
    const store = new MemoryCommandStore(room);
    const peers = recipients("seat-1");
    const created = vi.fn(() => context);
    const executed = vi.fn((state: MatchState, _command: MatchCommand, _context: MatchExecutionContext) => state);
    const pipeline = createCommandPipeline({ store, createExecutionContext: created, executeMatchCommand: executed });

    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: JSON.stringify({
        type: "match.command", commandId: ids[0], expectedVersion: room.roomVersion,
        command: { type: "START_GATHERING" }
      }),
      now: 123, presence: noPresence, recipients: peers.recipients
    });

    expect(created).toHaveBeenCalledWith(123);
    expect(executed.mock.calls[0][1]).toEqual({
      type: "START_GATHERING",
      playerId: room.seats[0].playerId
    });
    expect(executed.mock.calls[0][2]).toBe(context);
  });

  it("increments exactly once, persists before broadcasting, and projects for each seat", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    store.room!.seats[1].acceptedCommandIds = [{ commandId: ids[70], resultingVersion: store.room!.roomVersion }];
    const before = store.room!.roomVersion;
    const messages = new Map<string, ServerWebSocketMessage[]>();
    const peers: CommandRecipient[] = ["seat-1", "seat-2"].map((seatId) => ({
      seatId,
      send(message) {
        expect(store.commits).toBe(1);
        (messages.get(seatId) ?? messages.set(seatId, []).get(seatId)!).push(message);
      }
    }));
    const pipeline = createCommandPipeline({ store });

    await pipeline.handle({ seatId: "seat-1", rawMessage: command(ids[0], before), now: 100, presence: noPresence, recipients: peers });

    expect(store.room!.roomVersion).toBe(before + 1);
    expect(messages.get("seat-1")?.[0]).toMatchObject({ type: "room.snapshot", acknowledgedCommandId: ids[0] });
    expect(messages.get("seat-2")?.[0]).toMatchObject({ type: "room.snapshot", acknowledgedCommandId: ids[0] });
    expect((messages.get("seat-1")?.[0] as { privateState: unknown }).privateState)
      .not.toEqual((messages.get("seat-2")?.[0] as { privateState: unknown }).privateState);
    expect(JSON.stringify([...messages.values()])).not.toContain(ids[70]);
  });

  it("deduplicates before version comparison and returns the current caller snapshot", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    const peers = recipients("seat-1", "seat-2");
    const pipeline = createCommandPipeline({ store });
    const version = store.room!.roomVersion;
    await pipeline.handle({ seatId: "seat-1", rawMessage: command(ids[0], version), now: 100, presence: noPresence, recipients: peers.recipients });
    peers.messages.clear();

    await pipeline.handle({ seatId: "seat-1", rawMessage: command(ids[0], version), now: 101, presence: noPresence, recipients: peers.recipients });

    expect(store.commits).toBe(1);
    expect(store.room!.seats[0].commandAttemptTimestamps).toEqual([100]);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({ type: "room.snapshot", roomVersion: version + 1, acknowledgedCommandId: ids[0] });
    expect(peers.messages.has("seat-2")).toBe(false);
  });

  it("keeps only the latest 64 accepted command IDs per seat", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    const peers = recipients("seat-1");
    const pipeline = createCommandPipeline({ store, rateLimit: { maximum: 1_000, windowMs: 2_000 } });

    for (let index = 0; index < 65; index += 1) {
      await pipeline.handle({
        seatId: "seat-1", rawMessage: command(ids[index], store.room!.roomVersion, index % 2 === 0),
        now: 100 + index, presence: noPresence, recipients: peers.recipients
      });
    }

    expect(store.room!.seats[0].acceptedCommandIds).toHaveLength(64);
    expect(store.room!.seats[0].acceptedCommandIds.map((entry) => entry.commandId)).toEqual(ids.slice(1, 65));
  });

  it("returns a caller-specific snapshot for stale versions without gameplay mutation", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    const peers = recipients("seat-1", "seat-2");
    const pipeline = createCommandPipeline({ store });

    await pipeline.handle({ seatId: "seat-1", rawMessage: command(ids[0], 0), now: 100, presence: noPresence, recipients: peers.recipients });

    expect(store.commits).toBe(1);
    expect(store.room!.roomVersion).toBe(lobbyRoom().roomVersion);
    expect(store.room!.lastActivityAt).toBe(lobbyRoom().lastActivityAt);
    expect(store.room!.seats[0].commandAttemptTimestamps).toEqual([100]);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected", commandId: ids[0], error: { code: "VERSION_CONFLICT" },
      snapshot: { type: "room.snapshot", roomVersion: store.room!.roomVersion }
    });
    expect(peers.messages.has("seat-2")).toBe(false);
  });

  it("isolates rule and internal failures to the sender without partial write or broadcast", async () => {
    for (const failure of [new RuleViolationError("illegal"), new Error("secret details")]) {
      const original = playingRoom();
      const store = new MemoryCommandStore(structuredClone(original));
      const peers = recipients("seat-1", "seat-2");
      const pipeline = createCommandPipeline({
        store, createExecutionContext: () => context,
        executeMatchCommand() { throw failure; }
      });
      await pipeline.handle({
        seatId: "seat-1",
        rawMessage: JSON.stringify({
          type: "match.command", commandId: ids[0], expectedVersion: store.room!.roomVersion,
          command: { type: "ROLL_DICE" }
        }),
        now: 100, presence: noPresence, recipients: peers.recipients
      });

      expect(store.commits).toBe(1);
      expect(store.room!.roomVersion).toBe(original.roomVersion);
      expect(store.room!.lastActivityAt).toBe(original.lastActivityAt);
      expect(store.room!.expiresAt).toBe(original.expiresAt);
      expect(store.room!.matchState).toEqual(original.matchState);
      expect(store.room!.seats[0].acceptedCommandIds).toEqual(original.seats[0].acceptedCommandIds);
      expect(store.room!.seats[0].commandAttemptTimestamps).toEqual([100]);
      expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
        type: "command.rejected",
        error: { code: failure instanceof RuleViolationError ? "RULE_VIOLATION" : "INTERNAL_ERROR" }
      });
      expect(JSON.stringify(peers.messages.get("seat-1"))).not.toContain("secret details");
      expect(peers.messages.has("seat-2")).toBe(false);
    }
  });

  it("preflights projection before commit so projection failures cannot create an unbroadcastable version", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    const peers = recipients("seat-1", "seat-2");
    const pipeline = createCommandPipeline({
      store,
      projectRoom() { throw new Error("private projection detail"); }
    });

    await pipeline.handle({
      seatId: "seat-1", rawMessage: command(ids[0], store.room!.roomVersion), now: 100,
      presence: noPresence, recipients: peers.recipients
    });

    expect(store.commits).toBe(1);
    expect(store.room!.roomVersion).toBe(lobbyRoom().roomVersion);
    expect(store.room!.lastActivityAt).toBe(lobbyRoom().lastActivityAt);
    expect(store.room!.seats[0].commandAttemptTimestamps).toEqual([100]);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected", error: { code: "INTERNAL_ERROR" }
    });
    expect(JSON.stringify(peers.messages.get("seat-1"))).not.toContain("private projection detail");
    expect(peers.messages.has("seat-2")).toBe(false);
  });

  it("limits a seat to ten commands per two seconds without corrupting room state", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    const peers = recipients("seat-1");
    let pipeline = createCommandPipeline({ store });
    for (let index = 0; index < 11; index += 1) {
      await pipeline.handle({
        seatId: "seat-1", rawMessage: command(ids[index], store.room!.roomVersion, index % 2 === 0),
        now: 100 + index, presence: noPresence, recipients: peers.recipients
      });
    }

    expect(store.commits).toBe(10);
    expect(store.room!.seats[0].acceptedCommandIds).toHaveLength(10);
    expect(peers.messages.get("seat-1")?.at(-1)).toMatchObject({
      type: "command.rejected", commandId: ids[10], error: { code: "RATE_LIMITED" }
    });

    pipeline = createCommandPipeline({ store });
    await pipeline.handle({
      seatId: "seat-1", rawMessage: command(ids[11], store.room!.roomVersion), now: 113,
      presence: noPresence, recipients: peers.recipients
    });
    expect(store.commits).toBe(10);
    expect(peers.messages.get("seat-1")?.at(-1)).toMatchObject({
      type: "command.rejected", commandId: ids[11], error: { code: "RATE_LIMITED" }
    });

    await pipeline.handle({
      seatId: "seat-1", rawMessage: command(ids[0], 0), now: 112,
      presence: noPresence, recipients: peers.recipients
    });
    expect(store.commits).toBe(10);
    expect(peers.messages.get("seat-1")?.at(-1)).toMatchObject({
      type: "room.snapshot", acknowledgedCommandId: ids[0]
    });
  });

  it("expires attempts exactly at the two-second window boundary", async () => {
    const room = lobbyRoom();
    room.seats[0].commandAttemptTimestamps = Array.from({ length: 10 }, () => 100);
    const store = new MemoryCommandStore(room);
    const peers = recipients("seat-1");

    await createCommandPipeline({ store }).handle({
      seatId: "seat-1", rawMessage: command(ids[0], room.roomVersion), now: 2_100,
      presence: noPresence, recipients: peers.recipients
    });

    expect(store.room!.roomVersion).toBe(room.roomVersion + 1);
    expect(store.room!.seats[0].commandAttemptTimestamps).toEqual([2_100]);
  });

  it("emits the exact expired terminal message and safely closes on auth or transaction expiry races", async () => {
    class ExpiringStore extends MemoryCommandStore {
      constructor(room: PersistedRoom, private readonly expireOnCall: number) { super(room); }

      override async mutateLatest<T>(
        now: number,
        mutation: (room: PersistedRoom) => LatestRoomMutation<T>
      ) {
        if (this.calls + 1 === this.expireOnCall) {
          this.calls += 1;
          return { kind: "expired", expiredAt: now } as const;
        }
        return super.mutateLatest(now, mutation);
      }
    }

    for (const scenario of [
      { expireOnCall: 1, rawMessage: command(ids[0], lobbyRoom().roomVersion) },
      { expireOnCall: 1, rawMessage: JSON.stringify({ type: "connection.heartbeat" }) },
      { expireOnCall: 2, rawMessage: command(ids[0], lobbyRoom().roomVersion) }
    ]) {
      const store = new ExpiringStore(lobbyRoom(), scenario.expireOnCall);
      const peers = recipients("seat-1", "seat-2");
      await createCommandPipeline({ store }).handle({
        seatId: "seat-1", rawMessage: scenario.rawMessage, now: 100,
        presence: noPresence, recipients: peers.recipients
      });

      for (const seatId of ["seat-1", "seat-2"]) {
        expect(peers.messages.get(seatId)?.[0]).toEqual({
          type: "room.expired",
          error: { code: "ROOM_EXPIRED", params: {}, retryable: false }
        });
        expect(peers.closes.get(seatId)).toEqual([{ code: 4002, reason: "ROOM_EXPIRED" }]);
      }
    }

    const store = new ExpiringStore(lobbyRoom(), 1);
    const messages: ServerWebSocketMessage[] = [];
    const pipeline = createCommandPipeline({ store });
    await expect(pipeline.handle({
      seatId: "seat-1", rawMessage: command(ids[0], lobbyRoom().roomVersion), now: 100,
      presence: noPresence,
      recipients: [
        { seatId: "seat-1", send: (message) => messages.push(message), close: () => { throw new Error("closed peer"); } },
        { seatId: "seat-2", send: (message) => messages.push(message), close: vi.fn() }
      ]
    })).resolves.toBeUndefined();
    expect(messages).toHaveLength(2);
  });

  it("replays the same restart context across a transaction retry and commits and broadcasts once", async () => {
    let room = playingRoom();
    const store = new class extends MemoryCommandStore {
      retriedUpdates = 0;

      override async mutateLatest<T>(
        now: number,
        mutation: (current: PersistedRoom) => LatestRoomMutation<T>
      ) {
        this.calls += 1;
        const current = structuredClone(this.room!);
        const first = mutation(structuredClone(current));
        const second = mutation(structuredClone(current));
        expect(first).toEqual(second);
        if (second.kind === "updated") {
          this.retriedUpdates += 1;
          this.room = structuredClone(second.room);
          this.commits += 1;
        }
        return { kind: "active", value: second.value, room: structuredClone(this.room!) } as const;
      }
    }(room);
    const peers = recipients("seat-1", "seat-2", "seat-3");
    const pipeline = createCommandPipeline({
      store,
      prepareExecutionContext: () => () => ({
        random: { nextInt: () => 0 },
        nextMapSeed: () => parseMapSeed("M1-0000000000000003"),
        nextLogId: () => "retry-log",
        now: () => 100
      }),
    });
    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: JSON.stringify({
        type: "room.restart", commandId: ids[0], expectedVersion: room.roomVersion,
        mode: "fresh"
      }),
      now: 100, presence: noPresence, recipients: peers.recipients
    });

    expect(store.retriedUpdates).toBe(1);
    expect(store.commits).toBe(1);
    expect(store.room!.matchState).toMatchObject({
      game: { mapSeed: parseMapSeed("M1-0000000000000003"), phase: "setup" },
      lastDice: null
    });
    expect(store.room!.seats.map((seat) => seat.acceptedCommandIds)).toEqual([
      [{ commandId: ids[0], resultingVersion: room.roomVersion + 1 }],
      [],
      []
    ]);
    expect([...peers.messages.values()].flat()).toHaveLength(3);
  });

  it("persists zero and positive sealed bids, exposes only submission status and the caller's own bid, and permits replacement", async () => {
    const store = new MemoryCommandStore(auctionRoom());
    const peers = recipients("seat-1", "seat-2", "seat-3");
    let pipeline = createCommandPipeline({ store, createExecutionContext: () => context });

    await pipeline.handle({
      seatId: "seat-1", rawMessage: bid(ids[0], store.room!.roomVersion, 0), now: 100,
      presence: noPresence, recipients: peers.recipients
    });
    pipeline = createCommandPipeline({ store, createExecutionContext: () => context });
    await pipeline.handle({
      seatId: "seat-2", rawMessage: bid(ids[1], store.room!.roomVersion, 1), now: 101,
      presence: noPresence, recipients: peers.recipients
    });
    await pipeline.handle({
      seatId: "seat-2", rawMessage: bid(ids[2], store.room!.roomVersion, 2), now: 102,
      presence: noPresence, recipients: peers.recipients
    });

    expect(store.room!.pendingAuction).toEqual({
      round: 1, bidsBySeatId: { "seat-1": 0, "seat-2": 2 }
    });
    expect(store.room!.roomVersion).toBe(playingRoom().roomVersion + 3);
    const latestBySeat = new Map([...peers.messages].map(([seatId, messages]) => [seatId, messages.at(-1)!]));
    for (const [seatId, message] of latestBySeat) {
      expect(message).toMatchObject({
        type: "room.snapshot",
        publicState: { submittedBidSeatIds: ["seat-1", "seat-2"] },
        privateState: seatId === "seat-1"
          ? { ownPendingBid: 0 }
          : seatId === "seat-2" ? { ownPendingBid: 2 } : {}
      });
      const serialized = JSON.stringify(message);
      if (seatId !== "seat-2") expect(serialized).not.toContain('"ownPendingBid":2');
    }
  });

  it("opens an immediately UI-submittable sealed auction and clears stale pending input outside auction", async () => {
    const initial = playingRoom();
    initial.matchState = {
      ...initial.matchState!,
      game: {
        ...initial.matchState!.game,
        phase: "playing",
        turnState: { phase: "action", pendingDiscards: {}, developmentCardPlayed: false },
        players: initial.matchState!.game.players.map((player, index) => ({
          ...player,
          guildTokens: index === 0 ? 1 : 0
        }))
      },
      guild: {
        ...initial.matchState!.guild,
        gathering: { phase: "redemption", redemptions: {}, auctionRound: 1, auctionResults: [] }
      }
    };
    const store = new MemoryCommandStore(initial);
    const peers = recipients("seat-1", "seat-2", "seat-3");
    const pipeline = createCommandPipeline({ store, createExecutionContext: () => context });

    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: JSON.stringify({
        type: "match.command", commandId: ids[20], expectedVersion: initial.roomVersion,
        command: { type: "OPEN_AUCTION" }
      }),
      now: 200, presence: noPresence, recipients: peers.recipients
    });

    expect(store.room!.roomVersion).toBe(initial.roomVersion + 1);
    expect(store.room!.pendingAuction).toEqual({ round: 1, bidsBySeatId: {} });
    expect(peers.messages.get("seat-1")!.at(-1)).toMatchObject({
      type: "room.snapshot",
      allowedActions: { sealedBid: { enabled: true, round: 1, submitted: false, maxAmount: 1 } }
    });

    store.room = {
      ...store.room!,
      pendingAuction: { round: 1, bidsBySeatId: { "seat-1": 1 } },
      matchState: {
        ...store.room!.matchState!,
        guild: {
          ...store.room!.matchState!.guild,
          gathering: { phase: "complete", redemptions: {}, auctionRound: 1, auctionResults: [] }
        }
      }
    };
    const beforeEnd = store.room.roomVersion;
    await pipeline.handle({
      seatId: "seat-1",
      rawMessage: JSON.stringify({
        type: "match.command", commandId: ids[21], expectedVersion: beforeEnd,
        command: { type: "END_TURN" }
      }),
      now: 201, presence: noPresence, recipients: peers.recipients
    });
    expect(store.room!.roomVersion).toBe(beforeEnd + 1);
    expect(store.room!.pendingAuction).toBeUndefined();
  });

  it("rejects unaffordable bids without changing auction state or leaking the amount", async () => {
    const initial = auctionRoom();
    const store = new MemoryCommandStore(initial);
    const peers = recipients("seat-3");

    await createCommandPipeline({ store, createExecutionContext: () => context }).handle({
      seatId: "seat-3", rawMessage: bid(ids[0], initial.roomVersion, 2), now: 100,
      presence: noPresence, recipients: peers.recipients
    });

    expect(store.room!.pendingAuction).toBeUndefined();
    expect(store.room!.roomVersion).toBe(initial.roomVersion);
    expect(store.room!.lastActivityAt).toBe(initial.lastActivityAt);
    expect(peers.messages.get("seat-3")?.[0]).toMatchObject({
      type: "command.rejected", error: { code: "RULE_VIOLATION", params: {} }
    });
    expect(JSON.stringify(peers.messages)).not.toContain("exceeds");
  });

  it("resolves an all-zero round once, opens the next empty round, and advances without randomness", async () => {
    const store = new MemoryCommandStore(auctionRoom());
    const peers = recipients("seat-1", "seat-2", "seat-3");
    const execute = vi.fn(applyMatchCommand);
    const random = vi.fn(() => { throw new Error("all-zero bids must not use randomness"); });
    const pipeline = createCommandPipeline({
      store,
      executeMatchCommand: execute,
      createExecutionContext: () => ({ ...context, random: { nextInt: random } })
    });

    for (let index = 0; index < 3; index += 1) {
      await pipeline.handle({
        seatId: `seat-${index + 1}`,
        rawMessage: bid(ids[index], store.room!.roomVersion, 0), now: 100 + index,
        presence: noPresence, recipients: peers.recipients
      });
    }

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][1]).toEqual({ type: "RESOLVE_AUCTION", bids: { p1: 0, p2: 0, p3: 0 } });
    expect(random).not.toHaveBeenCalled();
    expect(store.room!.pendingAuction).toEqual({ round: 2, bidsBySeatId: {} });
    expect(store.room!.matchState!.guild.gathering.auctionRound).toBe(2);
    expect(store.room!.matchState!.guild.gathering.phase).toBe("auction");
    for (const messages of peers.messages.values()) {
      const final = messages.at(-1)!;
      expect(final).toMatchObject({
        type: "room.snapshot",
        publicState: { submittedBidSeatIds: [] },
        allowedActions: { sealedBid: { enabled: true, round: 2, submitted: false } }
      });
      expect((final as { privateState: Record<string, unknown> }).privateState).not.toHaveProperty("ownPendingBid");
    }
  });

  it("atomically combines concurrent final bids against latest persisted state and resolves a positive winner once", async () => {
    const initial = auctionRoom();
    initial.pendingAuction = { round: 1, bidsBySeatId: { "seat-1": 1 } };
    const store = new MemoryCommandStore(initial);
    const peers = recipients("seat-1", "seat-2", "seat-3");
    const execute = vi.fn(applyMatchCommand);
    const pipeline = createCommandPipeline({
      store, executeMatchCommand: execute,
      createExecutionContext: () => ({ ...context, random: { nextInt: () => 80 } })
    });

    await Promise.all([
      pipeline.handle({
        seatId: "seat-2", rawMessage: bid(ids[1], initial.roomVersion, 2), now: 101,
        presence: noPresence, recipients: peers.recipients
      }),
      pipeline.handle({
        seatId: "seat-3", rawMessage: bid(ids[2], initial.roomVersion + 1, 1), now: 102,
        presence: noPresence, recipients: peers.recipients
      })
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][1]).toEqual({ type: "RESOLVE_AUCTION", bids: { p1: 1, p2: 2, p3: 1 } });
    expect(store.room!.pendingAuction).toEqual({ round: 2, bidsBySeatId: {} });
    expect(store.room!.matchState!.game.players.find(({ id }) => id === "p2")!.guildTokens).toBe(0);
    expect(store.room!.matchState!.guild.gathering.lastAuctionResult).toMatchObject({
      winnerId: "p2", winningBid: 2
    });
  });

  it("restores an unresolved caller bid from persisted storage after room-runtime recreation", async () => {
    const initial = auctionRoom();
    const data = new Map<string, unknown>([["room", structuredClone(initial)]]);
    const storage: RoomStorage = {
      async get(key: string) { return data.get(key); },
      async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
      async delete(key: string) { return data.delete(key); },
      async setAlarm() {},
      async deleteAlarm() {},
      async transaction<T>(closure: (transaction: RoomStorage) => Promise<T>) {
        return closure(storage);
      }
    };
    const firstPeers = recipients("seat-1", "seat-2", "seat-3");
    await createCommandPipeline({ store: new RoomStore(storage), createExecutionContext: () => context }).handle({
      seatId: "seat-1", rawMessage: bid(ids[0], initial.roomVersion, 3), now: 100,
      presence: noPresence, recipients: firstPeers.recipients
    });

    const rehydratedStore = new RoomStore(storage);
    const reconnected = recipients("seat-1");
    await createCommandPipeline({ store: rehydratedStore, createExecutionContext: () => context }).handle({
      seatId: "seat-1", rawMessage: bid(ids[0], initial.roomVersion, 3), now: 101,
      presence: noPresence, recipients: reconnected.recipients
    });

    expect((data.get("room") as PersistedRoom).pendingAuction).toEqual({
      round: 1, bidsBySeatId: { "seat-1": 3 }
    });
    expect(reconnected.messages.get("seat-1")?.[0]).toMatchObject({
      type: "room.snapshot",
      publicState: { submittedBidSeatIds: ["seat-1"] },
      privateState: { ownPendingBid: 3 },
      acknowledgedCommandId: ids[0]
    });
  });

  it("publishes only the winning amount and redacts a development-card outcome from every losing seat", async () => {
    const initial = auctionRoom([765_432, 876_543, 1]);
    const store = new MemoryCommandStore(initial);
    const peers = recipients("seat-1", "seat-2", "seat-3");
    const pipeline = createCommandPipeline({
      store,
      createExecutionContext: () => ({
        ...context,
        random: { nextInt: (maximum) => maximum - 1 }
      })
    });

    for (const [index, amount] of [765_431, 876_543, 0].entries()) {
      await pipeline.handle({
        seatId: `seat-${index + 1}`,
        rawMessage: bid(ids[index], store.room!.roomVersion, amount), now: 100 + index,
        presence: noPresence, recipients: peers.recipients
      });
    }

    const result = store.room!.matchState!.guild.gathering.lastAuctionResult;
    expect(result).toMatchObject({
      winnerId: "p2", winningBid: 876_543, outcome: { kind: "developmentCard" }
    });
    const awardedCard = store.room!.matchState!.game.players.find(({ id }) => id === "p2")!
      .developmentCards.at(-1)!;
    for (const seatId of ["seat-1", "seat-2", "seat-3"]) {
      const final = peers.messages.get(seatId)!.at(-1)! as Extract<ServerWebSocketMessage, { type: "room.snapshot" }>;
      const serialized = JSON.stringify(final);
      expect(serialized).not.toContain("765431");
      expect(final.publicState).toMatchObject({
        submittedBidSeatIds: [],
        guild: { gathering: { lastAuctionResult: {
          winnerId: "p2", winningBid: 876_543, outcome: { kind: "developmentCard" }
        } } }
      });
      if (seatId === "seat-2") {
        expect(final.privateState).toMatchObject({ developmentCards: expect.arrayContaining([awardedCard]) });
      } else {
        expect(serialized).not.toContain(awardedCard.id);
        expect(serialized).not.toContain(`\"kind\":\"${awardedCard.kind}\"`);
      }
    }
  });

  it("executes through the Durable Object WebSocket adapter against persisted storage", async () => {
    const initial = lobbyRoom();
    const data = new Map<string, unknown>([["room", initial]]);
    const storage: RoomStorage = {
      async get(key: string) { return data.get(key); },
      async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
      async delete(key: string) { return data.delete(key); },
      async setAlarm() {},
      async deleteAlarm() {},
      async transaction<T>(closure: (transaction: RoomStorage) => Promise<T>) {
        return closure(storage);
      }
    };
    const sent: string[] = [];
    const socket = {
      readyState: WebSocket.OPEN,
      deserializeAttachment: () => ({ seatId: "seat-1", connectionId: "connection-1", connectedAt: 1 }),
      send(value: string) {
        expect((data.get("room") as PersistedRoom).roomVersion).toBe(initial.roomVersion + 1);
        sent.push(value);
      },
      close() {}
    } as unknown as WebSocket;
    const state = {
      storage,
      getWebSockets: () => [socket]
    } as unknown as DurableObjectState;
    const object = new RoomDurableObject(state, {} as Env);

    await object.webSocketMessage(socket, command(ids[0], initial.roomVersion));

    expect(JSON.parse(sent[0])).toMatchObject({
      type: "room.snapshot", roomVersion: initial.roomVersion + 1,
      acknowledgedCommandId: ids[0]
    });
  });
});
