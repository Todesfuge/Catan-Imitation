import { describe, expect, it } from "vitest";

import { parseMapSeed } from "../../src/domain/mapSeed";
import type { MatchExecutionContext } from "../../src/domain/match/types";
import type { ServerWebSocketMessage } from "../../src/online/protocol";
import {
  createCommandPipeline,
  type CommandMutationStore,
  type CommandRecipient,
  type LatestRoomMutation
} from "../../worker/room/commandPipeline";
import { createLobby, joinLobby, setLobbyReady, startLobby } from "../../worker/room/roomLifecycle";
import {
  ROOM_RECORD_KEY,
  RoomStore,
  type LatestRoomMutationResult,
  type RoomStorage
} from "../../worker/room/roomStore";
import type { PersistedRoom } from "../../worker/room/roomTypes";

const COMMAND_ID = "00000000-0000-4000-8000-000000000001";
const context: MatchExecutionContext = {
  random: { nextInt: () => 0 },
  nextMapSeed: () => parseMapSeed("M1-0000000000000001"),
  nextLogId: () => "authority-log",
  now: () => 10_000
};

function playableRoom(): PersistedRoom {
  let room = createLobby({
    roomCode: "ABC234", seatId: "seat-1", nickname: "One", tokenHash: "A".repeat(43)
  }, 1_000);
  room = joinLobby(room, {
    seatId: "seat-2", nickname: "Two", tokenHash: "B".repeat(43)
  }, 1_001);
  room = joinLobby(room, {
    seatId: "seat-3", nickname: "Three", tokenHash: "C".repeat(43)
  }, 1_002);
  for (const seat of room.seats) room = setLobbyReady(room, seat.seatId, true, 2_000 + seat.joinOrder);
  const started = startLobby(room, room.hostSeatId, context, 3_000);
  const { setup: _setup, ...game } = started.matchState!.game;
  return {
    ...started,
    matchState: {
      ...started.matchState!,
      game: {
        ...game,
        phase: "playing",
        activePlayerId: "p1",
        turn: 11,
        round: 4,
        turnState: { phase: "action", pendingDiscards: {}, developmentCardPlayed: false }
      },
      guild: {
        ...started.matchState!.guild,
        gatheringCooldown: { availableAtTurn: 11, displayDuration: 3 }
      }
    }
  };
}

class MemoryCommandStore implements CommandMutationStore {
  commits = 0;
  calls = 0;
  constructor(public room: PersistedRoom) {}

  async mutateLatest<T>(
    _now: number,
    mutation: (room: PersistedRoom) => LatestRoomMutation<T>
  ): Promise<LatestRoomMutationResult<T>> {
    this.calls += 1;
    const result = mutation(structuredClone(this.room));
    if (result.kind === "updated") {
      this.room = structuredClone(result.room);
      this.commits += 1;
    }
    return { kind: "active", room: structuredClone(this.room), value: result.value };
  }
}

class CountingStorage implements RoomStorage {
  readonly values = new Map<string, unknown>();
  roomPuts = 0;

  async get(key: string): Promise<unknown> { return this.values.get(key); }
  async put(key: string, value: unknown): Promise<void> {
    if (key === ROOM_RECORD_KEY) this.roomPuts += 1;
    this.values.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<boolean> { return this.values.delete(key); }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
  async transaction<T>(closure: (storage: RoomStorage) => Promise<T>): Promise<T> {
    return closure(this);
  }
}

function startCommand(room: PersistedRoom, commandId = COMMAND_ID, expectedVersion = room.roomVersion): string {
  return JSON.stringify({
    type: "match.command",
    commandId,
    expectedVersion,
    command: { type: "START_GATHERING" }
  });
}

function recipientHarness(
  store: MemoryCommandStore,
  seatIds = ["seat-1", "seat-2", "seat-3"],
  requireCommitBeforeSnapshot = false
): { recipients: CommandRecipient[]; messages: Map<string, ServerWebSocketMessage[]> } {
  const messages = new Map<string, ServerWebSocketMessage[]>();
  return {
    messages,
    recipients: seatIds.map((seatId) => ({
      seatId,
      send(message) {
        if (requireCommitBeforeSnapshot && message.type === "room.snapshot") {
          expect(store.commits).toBe(1);
        }
        messages.set(seatId, [...messages.get(seatId) ?? [], message]);
      }
    }))
  };
}

async function handleStart(
  store: MemoryCommandStore,
  seatId: string,
  rawMessage: string,
  recipients: CommandRecipient[]
): Promise<void> {
  await createCommandPipeline({ store, createExecutionContext: () => context }).handle({
    seatId,
    rawMessage,
    now: 10_000,
    presence: [],
    recipients
  });
}

describe("authenticated gathering authority", () => {
  it("does not flush a legacy replacement when the authenticated command is rejected", async () => {
    const legacy = structuredClone(playableRoom()) as unknown as Record<string, any>;
    legacy.schemaVersion = 2;
    legacy.matchState.guild.lastAutoGatheringRound = legacy.matchState.game.round;
    delete legacy.matchState.guild.gatheringCooldown;
    const before = JSON.stringify(legacy);
    const storage = new CountingStorage();
    storage.values.set(ROOM_RECORD_KEY, legacy);
    const messages: ServerWebSocketMessage[] = [];

    await createCommandPipeline({ store: new RoomStore(storage) }).handle({
      seatId: "seat-1",
      rawMessage: startCommand(legacy as unknown as PersistedRoom, COMMAND_ID, 0),
      now: 10_000,
      presence: [],
      recipients: [{ seatId: "seat-1", send(message) { messages.push(message); } }]
    });

    expect(storage.roomPuts).toBe(0);
    expect(storage.values.get(ROOM_RECORD_KEY)).toBe(legacy);
    expect(JSON.stringify(storage.values.get(ROOM_RECORD_KEY))).toBe(before);
    expect(messages).toEqual([expect.objectContaining({
      type: "command.rejected",
      commandId: COMMAND_ID,
      error: expect.objectContaining({ code: "VERSION_CONFLICT" })
    })]);
  });

  it("rejects a non-current authenticated caller without changing persisted room state", async () => {
    const initial = playableRoom();
    const store = new MemoryCommandStore(structuredClone(initial));
    const peers = recipientHarness(store, ["seat-1", "seat-2"]);

    await handleStart(store, "seat-2", startCommand(initial), peers.recipients);

    expect(store.commits).toBe(0);
    expect(store.room).toEqual(initial);
    expect(peers.messages.get("seat-2")).toEqual([
      expect.objectContaining({ type: "command.rejected", commandId: COMMAND_ID })
    ]);
    expect(peers.messages.has("seat-1")).toBe(false);
  });

  it.each([
    {
      name: "an unresolved turn phase",
      mutate(room: PersistedRoom) {
        room.matchState!.game.turnState = { phase: "awaitingRoll", pendingDiscards: {} };
      },
      expectedVersion: undefined
    },
    {
      name: "a pending player trade",
      mutate(room: PersistedRoom) {
        room.matchState!.game.players[0].resources.wood = 1;
        room.matchState!.pendingPlayerTrade = {
          proposerId: "p1",
          offered: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
          requested: { wood: 0, brick: 1, wool: 0, grain: 0, ore: 0 }
        };
      },
      expectedVersion: undefined
    },
    {
      name: "a nonzero cooldown",
      mutate(room: PersistedRoom) {
        room.matchState!.guild.gatheringCooldown = { availableAtTurn: 13, displayDuration: 3 };
      },
      expectedVersion: undefined
    },
    {
      name: "a stale expected version",
      mutate(_room: PersistedRoom) {},
      expectedVersion: 0
    }
  ])("rejects $name without any persisted or recipient-side mutation", async ({ mutate, expectedVersion }) => {
    const initial = playableRoom();
    mutate(initial);
    const before = structuredClone(initial);
    const store = new MemoryCommandStore(initial);
    const peers = recipientHarness(store);

    await handleStart(
      store,
      "seat-1",
      startCommand(initial, COMMAND_ID, expectedVersion ?? initial.roomVersion),
      peers.recipients
    );

    expect(store.commits).toBe(0);
    expect(store.room).toEqual(before);
    expect(store.room.roomVersion).toBe(before.roomVersion);
    expect(store.room.seats[0].acceptedCommandIds).toEqual(before.seats[0].acceptedCommandIds);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "command.rejected", commandId: COMMAND_ID
    });
    expect(peers.messages.has("seat-2")).toBe(false);
    expect(peers.messages.has("seat-3")).toBe(false);
  });

  it("accepts the authenticated current caller with one persisted version before converged broadcasts", async () => {
    const initial = playableRoom();
    const store = new MemoryCommandStore(structuredClone(initial));
    const peers = recipientHarness(store, ["seat-1", "seat-2", "seat-3"], true);

    await handleStart(store, "seat-1", startCommand(initial), peers.recipients);

    expect(store.commits).toBe(1);
    expect(store.room.roomVersion).toBe(initial.roomVersion + 1);
    expect(store.room.matchState?.guild.gathering.phase).toBe("redemption");
    expect(store.room.seats[0].acceptedCommandIds.at(-1)).toEqual({
      commandId: COMMAND_ID,
      resultingVersion: initial.roomVersion + 1
    });
    const snapshots = ["seat-1", "seat-2", "seat-3"].map((seatId) =>
      peers.messages.get(seatId)?.[0] as Extract<ServerWebSocketMessage, { type: "room.snapshot" }>
    );
    expect(snapshots.every((snapshot) =>
      snapshot.type === "room.snapshot" &&
      snapshot.schemaVersion === 3 &&
      snapshot.roomVersion === initial.roomVersion + 1 &&
      snapshot.acknowledgedCommandId === COMMAND_ID
    )).toBe(true);
    expect(snapshots.map((snapshot) => snapshot.publicState)).toEqual([
      snapshots[0].publicState,
      snapshots[0].publicState,
      snapshots[0].publicState
    ]);
  });

  it("deduplicates before version checks without a second write or peer broadcast", async () => {
    const initial = playableRoom();
    initial.seats[0].acceptedCommandIds = [{
      commandId: COMMAND_ID,
      resultingVersion: initial.roomVersion
    }];
    const before = structuredClone(initial);
    const store = new MemoryCommandStore(initial);
    const peers = recipientHarness(store);

    await handleStart(store, "seat-1", startCommand(initial, COMMAND_ID, 0), peers.recipients);

    expect(store.commits).toBe(0);
    expect(store.room).toEqual(before);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({
      type: "room.snapshot",
      acknowledgedCommandId: COMMAND_ID,
      roomVersion: initial.roomVersion
    });
    expect(peers.messages.has("seat-2")).toBe(false);
    expect(peers.messages.has("seat-3")).toBe(false);
  });

  it("rejects a direct actor field at the protocol boundary before storage access", async () => {
    const initial = playableRoom();
    const store = new MemoryCommandStore(structuredClone(initial));
    const peers = recipientHarness(store);

    await handleStart(store, "seat-1", JSON.stringify({
      type: "match.command",
      commandId: COMMAND_ID,
      expectedVersion: initial.roomVersion,
      command: { type: "START_GATHERING", playerId: "p1" }
    }), peers.recipients);

    expect(store.calls).toBe(0);
    expect(store.commits).toBe(0);
    expect(store.room).toEqual(initial);
    expect(peers.messages.get("seat-1")?.[0]).toMatchObject({ type: "protocol.incompatible" });
    expect(peers.messages.has("seat-2")).toBe(false);
    expect(peers.messages.has("seat-3")).toBe(false);
  });
});
