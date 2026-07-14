import { describe, expect, it } from "vitest";

import {
  createInitialGatheringCooldown,
  createPostGatheringCooldown,
  type GatheringState
} from "../../src/domain/expansion/commerceGuild";
import { LEGACY_STANDARD_MAP_SEED, parseMapSeed, type MapSeed } from "../../src/domain/mapSeed";
import type { MatchExecutionContext } from "../../src/domain/match/types";
import { createBoardDataForSeed } from "../../src/domain/randomBoard";
import type { ServerWebSocketMessage } from "../../src/online/protocol";
import { projectRoomView } from "../../src/online/projectRoomView";
import { createCommandPipeline, type CommandRecipient } from "../../worker/room/commandPipeline";
import { createLobby, joinLobby, setLobbyReady, startLobby } from "../../worker/room/roomLifecycle";
import {
  ROOM_RECORD_KEY,
  RoomSchemaError,
  RoomStore,
  type RoomStorage
} from "../../worker/room/roomStore";
import type { PersistedRoom } from "../../worker/room/roomTypes";

const HASHES = ["A", "B", "C", "D"].map((character) => character.repeat(43));

class MemoryStorage implements RoomStorage {
  readonly values = new Map<string, unknown>();
  roomPutCount = 0;

  async get(key: string): Promise<unknown> { return this.values.get(key); }
  async put(key: string, value: unknown): Promise<void> {
    if (key === ROOM_RECORD_KEY) this.roomPutCount += 1;
    this.values.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<boolean> { return this.values.delete(key); }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
  async transaction<T>(closure: (storage: RoomStorage) => Promise<T>): Promise<T> {
    return closure(this);
  }
}

function context(seed: MapSeed = parseMapSeed("M1-0000000000000001")): MatchExecutionContext {
  return {
    random: { nextInt: () => 0 },
    nextMapSeed: () => seed,
    nextLogId: () => "migration-log",
    now: () => 10_000
  };
}

function currentPlayingRoom(
  playerCount: 3 | 4,
  seed: MapSeed = parseMapSeed("M1-0000000000000001")
): PersistedRoom {
  let room = createLobby({
    roomCode: "ABC234",
    seatId: "seat-1",
    nickname: "One",
    tokenHash: HASHES[0]
  }, 1_000);
  for (let index = 1; index < playerCount; index += 1) {
    room = joinLobby(room, {
      seatId: `seat-${index + 1}`,
      nickname: ["One", "Two", "Three", "Four"][index],
      tokenHash: HASHES[index]
    }, 1_000 + index);
  }
  for (const seat of room.seats) {
    room = setLobbyReady(room, seat.seatId, true, 2_000 + seat.joinOrder);
  }
  const setupSeed = seed === LEGACY_STANDARD_MAP_SEED
    ? parseMapSeed("M1-0000000000000001")
    : seed;
  const started = startLobby(room, room.hostSeatId, context(setupSeed), 3_000);
  const { setup: _setup, ...game } = started.matchState!.game;
  const boardData = createBoardDataForSeed(seed);
  return {
    ...started,
    lifecycle: "playing",
    matchState: {
      ...started.matchState!,
      game: {
        ...game,
        ...boardData,
        mapSeed: seed,
        robberHexId: boardData.board.find((hex) => hex.terrain === "desert")!.id,
        phase: "playing",
        turn: 11,
        round: 4,
        turnState: { phase: "action", pendingDiscards: {}, developmentCardPlayed: false },
        players: game.players.map((player, index) => ({ ...player, guildTokens: 5 - index }))
      }
    }
  };
}

function legacyV2(room: PersistedRoom): Record<string, any> {
  const raw = structuredClone(room) as Record<string, any>;
  raw.schemaVersion = 2;
  delete raw.matchState.guild.gatheringCooldown;
  raw.matchState.guild.lastAutoGatheringRound = 3;
  return raw;
}

function legacyV1(room: PersistedRoom): Record<string, any> {
  const raw = legacyV2(room);
  raw.schemaVersion = 1;
  delete raw.matchState.game.mapSeed;
  return raw;
}

function roomWithGathering(
  playerCount: 3 | 4,
  phase: "idle" | "redemption" | "auction" | "complete"
): PersistedRoom {
  const room = currentPlayingRoom(playerCount);
  const gathering: GatheringState = {
    phase,
    redemptions: phase === "idle" ? {} : { p1: 2 },
    auctionRound: phase === "idle" || phase === "redemption" ? 1 : 2,
    auctionResults: phase === "idle" || phase === "redemption"
      ? []
      : [{ kind: "voucher" as const }],
    ...(phase === "idle" || phase === "redemption" ? {} : {
      lastAuctionSummary: "One won round one.",
      lastAuctionResult: {
        winnerId: "p1",
        winnerName: "One",
        round: 1,
        winningBid: 2,
        outcome: { kind: "voucher" as const }
      }
    })
  };
  return {
    ...room,
    matchState: { ...room.matchState!, guild: { ...room.matchState!.guild, gathering } },
    ...(phase === "auction"
      ? { pendingAuction: { round: 2, bidsBySeatId: { "seat-1": 3 } } }
      : {})
  };
}

function publicRemaining(room: PersistedRoom): number {
  return projectRoomView(room, room.seats[0].seatId).publicState.guild!.gathering.cooldownRemaining;
}

describe("persisted gathering schema migration", () => {
  it("migrates a v2 idle match to a validated v3 initial window in one write", async () => {
    const raw = legacyV2(roomWithGathering(3, "idle"));
    const storage = new MemoryStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    const loaded = await new RoomStore(storage).load(10_000);

    expect(loaded?.schemaVersion).toBe(3);
    expect(loaded?.matchState?.guild.gatheringCooldown).toEqual(
      createInitialGatheringCooldown(11, 3)
    );
    expect(loaded?.matchState?.guild).not.toHaveProperty("lastAutoGatheringRound");
    expect(storage.roomPutCount).toBe(1);
  });

  it("migrates a v2 lobby without fabricating a match or cooldown and preserves every other field", async () => {
    const room = currentPlayingRoom(3);
    const raw = structuredClone({
      ...room,
      schemaVersion: 2,
      lifecycle: "lobby",
      roomVersion: 29,
      seats: room.seats.slice(0, 2).map(({ playerId: _playerId, ...seat }) => seat),
      hostSeatId: "seat-1",
      nextJoinOrder: 4,
      connectionTickets: [{
        ticketHash: "T".repeat(43), seatId: "seat-1", expiresAt: 20_000
      }]
    }) as Record<string, any>;
    delete raw.matchState;
    delete raw.pendingAuction;
    const storage = new MemoryStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    const loaded = await new RoomStore(storage).load(10_000);

    expect(loaded).not.toHaveProperty("matchState");
    expect(JSON.stringify(loaded)).not.toContain("gatheringCooldown");
    const { schemaVersion: _rawSchema, ...rawFields } = raw;
    const { schemaVersion: loadedSchema, ...loadedFields } = loaded!;
    expect(loadedSchema).toBe(3);
    expect(loadedFields).toEqual(rawFields);
    expect(storage.roomPutCount).toBe(1);
  });

  it.each([
    [3, "idle"], [3, "complete"], [4, "idle"], [4, "complete"]
  ] as const)(
    "migrates a %i-player v2 %s gathering to a 2n window while retaining the result",
    async (playerCount, phase) => {
      const raw = legacyV2(roomWithGathering(playerCount, phase));
      const originalGathering = structuredClone(raw.matchState.guild.gathering);
      const storage = new MemoryStorage();
      storage.values.set(ROOM_RECORD_KEY, raw);

      const loaded = await new RoomStore(storage).load(10_000);

      expect(loaded?.matchState?.guild.gathering).toEqual(originalGathering);
      expect(loaded?.matchState?.guild.gatheringCooldown).toEqual(
        createInitialGatheringCooldown(11, playerCount)
      );
      expect(publicRemaining(loaded!)).toBe(playerCount * 2);
      expect(storage.roomPutCount).toBe(1);
    }
  );

  it.each([
    [3, "redemption"], [3, "auction"], [4, "redemption"], [4, "auction"]
  ] as const)(
    "migrates a %i-player v2 %s gathering to an n window excluding the current turn",
    async (playerCount, phase) => {
      const raw = legacyV2(roomWithGathering(playerCount, phase));
      const originalGathering = structuredClone(raw.matchState.guild.gathering);
      const originalAuction = structuredClone(raw.pendingAuction);
      const storage = new MemoryStorage();
      storage.values.set(ROOM_RECORD_KEY, raw);

      const loaded = await new RoomStore(storage).load(10_000);

      expect(loaded?.matchState?.guild.gathering).toEqual(originalGathering);
      expect(loaded?.pendingAuction).toEqual(originalAuction);
      expect(loaded?.matchState?.guild.gatheringCooldown).toEqual(
        createPostGatheringCooldown(11, playerCount)
      );
      expect(publicRemaining(loaded!)).toBe(playerCount);
      const nextTurn = {
        ...loaded!,
        matchState: {
          ...loaded!.matchState!,
          game: { ...loaded!.matchState!.game, turn: 12 }
        }
      };
      expect(publicRemaining(nextTurn)).toBe(playerCount);
      expect(storage.roomPutCount).toBe(1);
    }
  );

  it("reconstructs the same public cooldown after migration, reconnect, and runtime eviction", async () => {
    const raw = legacyV2(roomWithGathering(4, "auction"));
    const commandId = "00000000-0000-4000-8000-000000000077";
    raw.seats[0].acceptedCommandIds = [{ commandId, resultingVersion: raw.roomVersion }];
    const storage = new MemoryStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);
    const snapshots: ServerWebSocketMessage[] = [];
    const connect = async (store: RoomStore) => createCommandPipeline({ store }).handle({
      seatId: "seat-1",
      rawMessage: JSON.stringify({
        type: "match.command",
        commandId,
        expectedVersion: raw.roomVersion,
        command: { type: "START_GATHERING" }
      }),
      now: 10_000,
      presence: [],
      recipients: [{ seatId: "seat-1", send(message) { snapshots.push(message); } }]
    });

    await connect(new RoomStore(storage));
    await connect(new RoomStore(storage));
    const afterEviction = await new RoomStore(storage).load(10_000);

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((message) => message.type === "room.snapshot"
      ? (message.publicState.guild as {
          gathering: { cooldownRemaining: number };
        } | undefined)?.gathering.cooldownRemaining
      : undefined)).toEqual([4, 4]);
    expect(snapshots.every((message) =>
      message.type === "room.snapshot" && message.schemaVersion === 3
    )).toBe(true);
    expect(publicRemaining(afterEviction!)).toBe(4);
    expect(storage.roomPutCount).toBe(1);
  });

  it.each([
    ["missing cooldown", (room: Record<string, any>) => {
      delete room.matchState.guild.gatheringCooldown;
    }],
    ["obsolete automatic metadata", (room: Record<string, any>) => {
      room.matchState.guild.lastAutoGatheringRound = 3;
    }],
    ["impossible duration", (room: Record<string, any>) => {
      room.matchState.guild.gatheringCooldown.displayDuration = 5;
    }],
    ["invalid target turn", (room: Record<string, any>) => {
      room.matchState.guild.gatheringCooldown.availableAtTurn = 0;
    }]
  ] as const)("rejects a current v3 room with %s without writing", async (_name, mutate) => {
    const room = structuredClone(currentPlayingRoom(3)) as unknown as Record<string, any>;
    mutate(room);
    const storage = new MemoryStorage();
    storage.values.set(ROOM_RECORD_KEY, room);

    await expect(new RoomStore(storage).load(10_000)).rejects.toBeInstanceOf(RoomSchemaError);
    expect(storage.roomPutCount).toBe(0);
  });

  it.each([
    ["malformed turn", (raw: Record<string, any>) => { raw.matchState.game.turn = 0; }],
    ["malformed player count", (raw: Record<string, any>) => { raw.matchState.game.players.pop(); }],
    ["unexpected cooldown data", (raw: Record<string, any>) => {
      raw.matchState.guild.gatheringCooldown = { availableAtTurn: 20, displayDuration: 3 };
    }],
    ["malformed obsolete metadata", (raw: Record<string, any>) => {
      raw.matchState.guild.lastAutoGatheringRound = 0;
    }]
  ] as const)("rejects invalid v2 %s byte-equivalently without a snapshot", async (_name, mutate) => {
    const raw = legacyV2(roomWithGathering(3, "auction"));
    mutate(raw);
    const before = JSON.stringify(raw);
    const storage = new MemoryStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);
    const messages: ServerWebSocketMessage[] = [];
    const recipients: CommandRecipient[] = ["seat-1", "seat-2"].map((seatId) => ({
      seatId,
      send(message) { messages.push(message); }
    }));

    await expect(createCommandPipeline({ store: new RoomStore(storage) }).handle({
      seatId: "seat-1",
      rawMessage: JSON.stringify({
        type: "match.command",
        commandId: "00000000-0000-4000-8000-000000000099",
        expectedVersion: raw.roomVersion,
        command: { type: "START_GATHERING" }
      }),
      now: 10_000,
      presence: [],
      recipients
    })).rejects.toBeInstanceOf(RoomSchemaError);

    expect(JSON.stringify(storage.values.get(ROOM_RECORD_KEY))).toBe(before);
    expect(storage.values.get(ROOM_RECORD_KEY)).toBe(raw);
    expect(storage.roomPutCount).toBe(0);
    expect(messages).toEqual([]);
  });

  it("chains the released v1 fixed-map migration into a valid v3 cooldown in one write", async () => {
    const raw = legacyV1(roomWithGathering(3, "idle"));
    const fixedMapRoom = currentPlayingRoom(3, LEGACY_STANDARD_MAP_SEED);
    const fixedRaw = legacyV1({
      ...fixedMapRoom,
      matchState: {
        ...fixedMapRoom.matchState!,
        game: {
          ...fixedMapRoom.matchState!.game,
          turn: raw.matchState.game.turn,
          round: raw.matchState.game.round
        }
      }
    });
    const storage = new MemoryStorage();
    storage.values.set(ROOM_RECORD_KEY, fixedRaw);

    const loaded = await new RoomStore(storage).load(10_000);

    expect(loaded?.schemaVersion).toBe(3);
    expect(loaded?.matchState?.game.mapSeed).toBe(LEGACY_STANDARD_MAP_SEED);
    expect(loaded?.matchState?.guild.gatheringCooldown).toEqual(
      createInitialGatheringCooldown(11, 3)
    );
    expect(storage.roomPutCount).toBe(1);
  });

  it("retains corrupt-v1 rejection without mutating storage", async () => {
    const raw = legacyV1(currentPlayingRoom(3, LEGACY_STANDARD_MAP_SEED));
    raw.matchState.game.board[0].terrain = "desert";
    const before = JSON.stringify(raw);
    const storage = new MemoryStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    await expect(new RoomStore(storage).load(10_000)).rejects.toBeInstanceOf(RoomSchemaError);

    expect(JSON.stringify(storage.values.get(ROOM_RECORD_KEY))).toBe(before);
    expect(storage.roomPutCount).toBe(0);
  });
});
