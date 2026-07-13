import { describe, expect, it } from "vitest";

import { createCommerceGuild } from "../../src/domain/expansion/commerceGuild";
import {
  LEGACY_STANDARD_MAP_SEED,
  parseMapSeed
} from "../../src/domain/mapSeed";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import type { MatchExecutionContext, MatchState } from "../../src/domain/match/types";
import {
  createLobby,
  joinLobby,
  setLobbyReady,
  startLobby
} from "../../worker/room/roomLifecycle";
import {
  ROOM_RECORD_KEY,
  RoomSchemaError,
  RoomStore,
  type RoomStorage
} from "../../worker/room/roomStore";
import type { PersistedRoom } from "../../worker/room/roomTypes";

const DAY_MS = 86_400_000;
const HASH = "A".repeat(43);
const M1_SEED = parseMapSeed("M1-0000000000000001");
const NAMES = ["Voyage1969", "Loss", "Kay", "Amias"] as const;

class CountingStorage implements RoomStorage {
  readonly values = new Map<string, unknown>();
  roomPutCount = 0;

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async put(key: string, value: unknown): Promise<void> {
    if (key === ROOM_RECORD_KEY) this.roomPutCount += 1;
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}

  async transaction<T>(closure: (transaction: RoomStorage) => Promise<T>): Promise<T> {
    return closure(this);
  }
}

function executionContext(seed = M1_SEED): MatchExecutionContext {
  let logId = 0;
  return {
    random: { nextInt: () => 0 },
    nextMapSeed: () => seed,
    nextLogId: () => `migration-log-${++logId}`,
    now: () => 10_000
  };
}

function createV2Lobby(seatCount = 4): PersistedRoom {
  let room = createLobby({
    roomCode: "ABC234",
    seatId: "seat-1",
    nickname: NAMES[0],
    tokenHash: HASH
  }, 1_000);
  for (let index = 1; index < seatCount; index += 1) {
    room = joinLobby(room, {
      seatId: `seat-${index + 1}`,
      nickname: NAMES[index],
      tokenHash: String.fromCharCode(65 + index).repeat(43)
    }, 1_000 + index);
  }
  return room;
}

function createRichMatch(): MatchState {
  const setup = createSetupMatch(
    NAMES.map((nickname) => ({ nickname })),
    { kind: "seed", seed: LEGACY_STANDARD_MAP_SEED },
    executionContext()
  );
  const { setup: _setup, ...scenario } = setup.game;
  const [heldCard, ...developmentDeck] = scenario.developmentDeck;
  const firstHex = scenario.board[0];
  const secondHex = scenario.board[1];
  return {
    game: {
      ...scenario,
      activePlayerId: "p2",
      turn: 17,
      round: 5,
      players: scenario.players.map((player, index) => ({
        ...player,
        resources: index === 0
          ? { wood: 2, brick: 1, wool: 3, grain: 0, ore: 4 }
          : player.resources,
        guildTokens: index === 0 ? 6 : index,
        developmentCards: index === 0 ? [{ ...heldCard, purchasedTurn: 9 }] : [],
        knightsPlayed: index === 0 ? 3 : 0
      })),
      developmentDeck,
      buildings: [
        { id: "building-preserved-1", ownerId: "p1", vertexId: firstHex.vertexIds[0], kind: "city" },
        { id: "building-preserved-2", ownerId: "p2", vertexId: secondHex.vertexIds[0], kind: "settlement" }
      ],
      roads: [
        { id: "road-preserved-1", ownerId: "p1", edgeId: firstHex.edgeIds[0] },
        { id: "road-preserved-2", ownerId: "p2", edgeId: secondHex.edgeIds[0] }
      ],
      largestArmyOwnerId: "p1",
      longestRoadOwnerId: "p2",
      log: [
        ...scenario.log,
        { id: "log-preserved", message: "Preserve this exact log entry." }
      ]
    },
    guild: {
      ...createCommerceGuild(),
      usedTradePlayerIds: ["p3"],
      gathering: {
        phase: "auction",
        redemptions: { p1: 2 },
        auctionRound: 2,
        auctionResults: [{ kind: "voucher" }],
        lastAuctionSummary: "Preserve the auction summary."
      }
    },
    lastDice: { first: 4, second: 5, total: 9 },
    pendingPlayerTrade: {
      proposerId: "p2",
      offered: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
      requested: { wood: 0, brick: 1, wool: 0, grain: 0, ore: 0 }
    }
  };
}

function createV2Playing(): PersistedRoom {
  const lobby = createV2Lobby();
  const matchState = createRichMatch();
  return {
    ...lobby,
    lifecycle: "playing",
    lastActivityAt: 8_000,
    expiresAt: 8_000 + DAY_MS,
    roomVersion: 41,
    seats: lobby.seats.map((seat, index) => ({
      ...seat,
      playerId: matchState.game.players[index].id,
      ready: true,
      acceptedCommandIds: [{ commandId: `accepted-${index}`, resultingVersion: 40 }],
      commandAttemptTimestamps: [7_000 + index]
    })),
    matchState,
    connectionTickets: [{
      ticketHash: "T".repeat(43),
      seatId: "seat-2",
      expiresAt: 20_000
    }],
    pendingAuction: { round: 2, bidsBySeatId: { "seat-1": 4, "seat-3": 1 } }
  };
}

function createV2Finished(): PersistedRoom {
  const playing = createV2Playing();
  return {
    ...playing,
    lifecycle: "finished",
    roomVersion: 42,
    matchState: {
      ...playing.matchState!,
      game: {
        ...playing.matchState!.game,
        phase: "gameOver",
        winnerId: "p1"
      }
    },
    pendingAuction: undefined
  };
}

function toLegacyRecord(room: PersistedRoom): Record<string, unknown> {
  const legacy = structuredClone(room) as Record<string, any>;
  legacy.schemaVersion = 1;
  if (legacy.matchState) delete legacy.matchState.game.mapSeed;
  if (legacy.pendingAuction === undefined) delete legacy.pendingAuction;
  return legacy;
}

function expectedMigration(raw: Record<string, unknown>): PersistedRoom {
  const expected = structuredClone(raw) as Record<string, any>;
  expected.schemaVersion = 2;
  if (expected.matchState) expected.matchState.game.mapSeed = "M0-STANDARD";
  return expected as PersistedRoom;
}

function corruptedLegacy(
  mutate: (game: Record<string, any>) => void
): Record<string, unknown> {
  const raw = toLegacyRecord(createV2Playing());
  mutate((raw.matchState as Record<string, any>).game);
  return raw;
}

describe("persisted room schema v2", () => {
  it("creates and writes schema-v2 lobbies without match state", async () => {
    const room = createLobby({
      roomCode: "ABC234",
      seatId: "seat-1",
      nickname: "Host",
      tokenHash: HASH
    }, 1_000);

    expect(room.schemaVersion).toBe(2);
    expect(Object.hasOwn(room, "matchState")).toBe(false);
    const storage = new CountingStorage();
    await expect(new RoomStore(storage).createIfEmpty(room)).resolves.toBe("created");
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(room);
  });

  it("starts a fresh canonical M1 match and stores exact seed-derived board data", async () => {
    let room = createV2Lobby(3);
    for (const seat of room.seats) {
      room = setLobbyReady(room, seat.seatId, true, 3_000 + seat.joinOrder);
    }

    const started = startLobby(room, room.hostSeatId, executionContext(), 10_000);
    expect(started.schemaVersion).toBe(2);
    expect(started.matchState?.game.mapSeed).toBe(M1_SEED);
    await expect(new RoomStore(new CountingStorage()).save(started)).resolves.toBeUndefined();
  });

  it.each([
    "m1-0000000000000001",
    "M1-000000000000001",
    "M2-0000000000000001"
  ])("rejects malformed or unsupported v2 seed %s without writing", async (mapSeed) => {
    const storage = new CountingStorage();
    const room = createV2Playing();
    await expect(new RoomStore(new CountingStorage()).save(room)).resolves.toBeUndefined();
    const malformed = {
      ...room,
      matchState: {
        ...room.matchState!,
        game: { ...room.matchState!.game, mapSeed }
      }
    } as PersistedRoom;
    const before = structuredClone(malformed);
    storage.values.set(ROOM_RECORD_KEY, malformed);

    await expect(new RoomStore(storage).load(10_000)).rejects.toBeInstanceOf(RoomSchemaError);
    expect(storage.values.get(ROOM_RECORD_KEY)).toBe(malformed);
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(before);
    expect(storage.roomPutCount).toBe(0);
  });

  it("rejects missing seeds and seed/board mismatches in v2 playing and finished rooms", async () => {
    await expect(new RoomStore(new CountingStorage()).save(createV2Playing()))
      .resolves.toBeUndefined();
    const playing = structuredClone(createV2Playing()) as Record<string, any>;
    delete playing.matchState.game.mapSeed;
    const finished = createV2Finished();
    const mismatched = {
      ...finished,
      matchState: {
        ...finished.matchState!,
        game: { ...finished.matchState!.game, mapSeed: M1_SEED }
      }
    };

    for (const invalid of [playing, mismatched]) {
      const storage = new CountingStorage();
      await expect(new RoomStore(storage).save(invalid as PersistedRoom))
        .rejects.toBeInstanceOf(RoomSchemaError);
      expect(storage.roomPutCount).toBe(0);
    }
  });
});

describe("legacy persisted-room migration", () => {
  it("migrates a v1 lobby by changing only schemaVersion", async () => {
    const v2 = {
      ...createV2Lobby(2),
      roomVersion: 19,
      connectionTickets: [{
        ticketHash: "V".repeat(43),
        seatId: "seat-1",
        expiresAt: 20_000
      }]
    };
    const raw = toLegacyRecord(v2);
    const storage = new CountingStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    const loaded = await new RoomStore(storage).load(10_000);

    expect(loaded).toEqual(expectedMigration(raw));
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(loaded);
    expect(storage.roomPutCount).toBe(1);
  });

  it.each([
    ["playing", createV2Playing],
    ["finished", createV2Finished]
  ] as const)("migrates an exact released v1 %s board while preserving all live state", async (
    _lifecycle,
    createRoom
  ) => {
    const raw = toLegacyRecord(createRoom());
    const storage = new CountingStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    const loaded = await new RoomStore(storage).load(10_000);

    expect(loaded).toEqual(expectedMigration(raw));
    expect(loaded?.roomVersion).toBe(raw.roomVersion);
    expect(loaded?.matchState?.game.mapSeed).toBe("M0-STANDARD");
    expect(storage.roomPutCount).toBe(1);
  });

  it.each([
    ["terrain", (game: Record<string, any>) => { game.board[0].terrain = "desert"; }],
    ["number", (game: Record<string, any>) => { game.board[0].diceNumber = 12; }],
    ["vertex reference", (game: Record<string, any>) => { game.board[0].vertexIds[0] = "vertex-corrupt"; }],
    ["edge reference", (game: Record<string, any>) => { game.board[0].edgeIds[0] = "edge-corrupt"; }],
    ["port type", (game: Record<string, any>) => {
      game.ports[0] = { ...game.ports[0], kind: "resource", resource: "ore" };
    }],
    ["port position", (game: Record<string, any>) => { game.ports[0].vertexIds.reverse(); }],
    ["board count", (game: Record<string, any>) => { game.board.pop(); }],
    ["non-finite number", (game: Record<string, any>) => { game.board[0].diceNumber = Number.NaN; }],
    ["undefined static field", (game: Record<string, any>) => { game.edges[0].vertexIds = undefined; }]
  ])("rejects v1 %s corruption without mutating raw storage", async (_name, mutate) => {
    const raw = corruptedLegacy(mutate);
    const before = structuredClone(raw);
    const storage = new CountingStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    await expect(new RoomStore(storage).load(10_000)).rejects.toBeInstanceOf(RoomSchemaError);

    expect(storage.values.get(ROOM_RECORD_KEY)).toBe(raw);
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(before);
    expect(storage.roomPutCount).toBe(0);
  });

  it("coalesces v1 migration, expired-ticket cleanup, and mutation into one validated write", async () => {
    const raw = toLegacyRecord({
      ...createV2Lobby(),
      connectionTickets: [
        { ticketHash: "X".repeat(43), seatId: "seat-1", expiresAt: 9_999 },
        { ticketHash: "Y".repeat(43), seatId: "seat-2", expiresAt: 20_000 }
      ]
    });
    const storage = new CountingStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    const result = await new RoomStore(storage).mutateLatest(10_000, (room) => ({
      kind: "updated",
      room: { ...room, roomVersion: room.roomVersion + 1 },
      value: "updated" as const
    }));

    expect(result).toMatchObject({
      kind: "active",
      value: "updated",
      room: {
        schemaVersion: 2,
        roomVersion: (raw.roomVersion as number) + 1,
        connectionTickets: [{ ticketHash: "Y".repeat(43) }]
      }
    });
    expect(storage.roomPutCount).toBe(1);
    await expect(new RoomStore(storage).load(10_000)).resolves.toMatchObject({ schemaVersion: 2 });
    expect(storage.roomPutCount).toBe(1);
  });
});
