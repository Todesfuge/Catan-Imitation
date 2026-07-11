import { describe, expect, it, vi } from "vitest";

import { RuleViolationError } from "../../src/domain/errors";
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
import { RoomDurableObject } from "../../worker/room/RoomDurableObject";
import type { Env } from "../../worker/env";
import type { RoomStorage } from "../../worker/room/roomStore";

const ids = Array.from({ length: 80 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);

const context: MatchExecutionContext = {
  random: { nextInt: () => 0 },
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

class MemoryCommandStore implements CommandMutationStore {
  commits = 0;

  constructor(public room: PersistedRoom | null) {}

  async mutateLatest<T>(
    _now: number,
    mutation: (room: PersistedRoom) => LatestRoomMutation<T>
  ) {
    if (this.room === null) return { kind: "missing" } as const;
    const result = mutation(structuredClone(this.room));
    if (result.kind === "updated") {
      this.room = structuredClone(result.room);
      this.commits += 1;
    }
    return { kind: "active", value: result.value, room: structuredClone(this.room) } as const;
  }
}

function recipients(...seatIds: string[]): { recipients: CommandRecipient[]; messages: Map<string, ServerWebSocketMessage[]> } {
  const messages = new Map<string, ServerWebSocketMessage[]>();
  return {
    messages,
    recipients: seatIds.map((seatId) => ({
      seatId,
      send(message) {
        const entries = messages.get(seatId) ?? [];
        entries.push(message);
        messages.set(seatId, entries);
      }
    }))
  };
}

function command(commandId: string, expectedVersion: number, ready = true): string {
  return JSON.stringify({ type: "room.ready", commandId, expectedVersion, ready });
}

const noPresence: PresenceEntry[] = [];

describe("authoritative room command pipeline", () => {
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
    expect(executed.mock.calls[0][1]).toEqual({ type: "START_GATHERING" });
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

  it("returns a caller-specific snapshot for stale versions without writing", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    const peers = recipients("seat-1", "seat-2");
    const pipeline = createCommandPipeline({ store });

    await pipeline.handle({ seatId: "seat-1", rawMessage: command(ids[0], 0), now: 100, presence: noPresence, recipients: peers.recipients });

    expect(store.commits).toBe(0);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected", commandId: ids[0], error: { code: "VERSION_CONFLICT" },
      snapshot: { type: "room.snapshot", roomVersion: store.room!.roomVersion }
    });
    expect(peers.messages.has("seat-2")).toBe(false);
  });

  it("isolates rule and internal failures to the sender without partial write or broadcast", async () => {
    for (const failure of [new RuleViolationError("illegal"), new Error("secret details")]) {
      const store = new MemoryCommandStore(playingRoom());
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

      expect(store.commits).toBe(0);
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

    expect(store.commits).toBe(0);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected", error: { code: "INTERNAL_ERROR" }
    });
    expect(JSON.stringify(peers.messages.get("seat-1"))).not.toContain("private projection detail");
    expect(peers.messages.has("seat-2")).toBe(false);
  });

  it("limits a seat to ten commands per two seconds without corrupting room state", async () => {
    const store = new MemoryCommandStore(lobbyRoom());
    const peers = recipients("seat-1");
    const pipeline = createCommandPipeline({ store });
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

    await pipeline.handle({
      seatId: "seat-1", rawMessage: command(ids[0], 0), now: 112,
      presence: noPresence, recipients: peers.recipients
    });
    expect(store.commits).toBe(10);
    expect(peers.messages.get("seat-1")?.at(-1)).toMatchObject({
      type: "room.snapshot", acknowledgedCommandId: ids[0]
    });
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
