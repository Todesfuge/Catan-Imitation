import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { hashSecret } from "../../worker/crypto";
import { RoomDurableObject } from "../../worker/room/RoomDurableObject";

import { parseMapSeed } from "../../src/domain/mapSeed";
import type { MatchExecutionContext } from "../../src/domain/match/types";
import { MAX_WIRE_BYTES } from "../../src/online/protocol";
import {
  ROOM_CODE_ALPHABET,
  RoomLifecycleError,
  createLobby,
  generateRoomCode,
  joinLobby,
  leaveLobby,
  normalizeNickname,
  normalizeRoomCode,
  refreshRoomActivity,
  setLobbyReady,
  startLobby
} from "../../worker/room/roomLifecycle";
import {
  MAX_OUTSTANDING_TICKETS_PER_ROOM,
  MAX_OUTSTANDING_TICKETS_PER_SEAT,
  ROOM_RECORD_KEY,
  RoomSchemaError,
  RoomStore,
  type RoomStorage
} from "../../worker/room/roomStore";
import type { PersistedRoom } from "../../worker/room/roomTypes";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const HASH = "A".repeat(43);

function context(): MatchExecutionContext {
  let logId = 0;
  return {
    random: { nextInt: () => 0 },
    nextMapSeed: () => parseMapSeed("M1-0000000000000001"),
    nextLogId: () => `log-${++logId}`,
    now: () => 1_000
  };
}

function roomWithSeats(count = 1, now = 1_000): PersistedRoom {
  let room = createLobby(
    {
      roomCode: "ABC234",
      seatId: "seat-1",
      nickname: "Host",
      tokenHash: HASH
    },
    now
  );
  for (let index = 2; index <= count; index += 1) {
    room = joinLobby(
      room,
      {
        seatId: `seat-${index}`,
        nickname: `Player ${index}`,
        tokenHash: String.fromCharCode(64 + index).repeat(43)
      },
      now + index
    );
  }
  return room;
}

function startedRoom(count = 3): PersistedRoom {
  let room = roomWithSeats(count);
  for (const seat of room.seats) {
    room = setLobbyReady(room, seat.seatId, true, 4_000 + seat.joinOrder);
  }
  return startLobby(room, room.hostSeatId, context(), 9_000);
}

function auctionRoom(): PersistedRoom {
  const room = startedRoom();
  if (room.matchState === undefined) throw new Error("expected match state");
  return {
    ...room,
    matchState: {
      ...room.matchState,
      game: {
        ...room.matchState.game,
        players: room.matchState.game.players.map((player, index) => ({
          ...player,
          guildTokens: index === 0 ? 2 : 1
        }))
      },
      guild: {
        ...room.matchState.guild,
        gathering: {
          ...room.matchState.guild.gathering,
          phase: "auction",
          auctionRound: 2
        }
      }
    },
    pendingAuction: { round: 2, bidsBySeatId: { "seat-1": 2 } }
  };
}

class MemoryStorage implements RoomStorage {
  readonly values = new Map<string, unknown>();
  readonly alarms: number[] = [];
  alarm: number | null = null;
  transactionCount = 0;
  beforeNextTransaction?: () => Promise<void>;
  private transactionTail: Promise<void> = Promise.resolve();

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    const alarm = scheduledTime instanceof Date ? scheduledTime.getTime() : scheduledTime;
    this.alarm = alarm;
    this.alarms.push(alarm);
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }

  async transaction<T>(closure: (transaction: RoomStorage) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const beforeTransaction = this.beforeNextTransaction;
      this.beforeNextTransaction = undefined;
      if (beforeTransaction !== undefined) await beforeTransaction();
      return await closure(this);
    } finally {
      release();
    }
  }
}

describe("room codes and nicknames", () => {
  it("generates six uppercase unambiguous room-code characters", () => {
    const code = generateRoomCode((bytes) => {
      bytes.set([0, 1, 2, 29, 30, 31]);
    });

    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(code).not.toMatch(/[0O1I]/);
  });

  it("normalizes invitation codes with trim and uppercase", () => {
    expect(normalizeRoomCode("  abC234 \n")).toBe("ABC234");
    expect(() => normalizeRoomCode("ABC01I")).toThrow(RoomLifecycleError);
    expect(() => normalizeRoomCode("ß2345")).toThrow(RoomLifecycleError);
  });

  it("normalizes display nicknames with trim, NFKC, and case folding", () => {
    expect(normalizeNickname("  Ｋａｙ  ")).toEqual({
      nickname: "Kay",
      normalizedNickname: "kay"
    });
  });

  it("accepts 1 through 20 Unicode code points and rejects outside the range", () => {
    expect(normalizeNickname("😀").nickname).toBe("😀");
    expect(normalizeNickname("😀".repeat(20)).nickname).toHaveLength(40);
    expect(() => normalizeNickname("   ")).toThrow(RoomLifecycleError);
    expect(() => normalizeNickname("😀".repeat(21))).toThrow(RoomLifecycleError);
  });
});

describe("pure lobby lifecycle", () => {
  it("creates a versioned host seat without plaintext credentials or presence", () => {
    const room = roomWithSeats();

    expect(room).toMatchObject({
      schemaVersion: 3,
      roomCode: "ABC234",
      lifecycle: "lobby",
      hostSeatId: "seat-1",
      roomVersion: 1,
      nextJoinOrder: 2,
      lastActivityAt: 1_000,
      expiresAt: 1_000 + DAY_MS
    });
    expect(room.seats[0]).toMatchObject({
      nickname: "Host",
      normalizedNickname: "host",
      tokenHash: HASH,
      joinOrder: 1,
      ready: false,
      acceptedCommandIds: [],
      commandAttemptTimestamps: []
    });
    expect(JSON.stringify(room)).not.toContain("seatToken");
    expect(room).not.toHaveProperty("presence");
  });

  it("keeps stable join order and rejects a case-insensitive duplicate nickname", () => {
    const room = roomWithSeats(3);

    expect(room.seats.map((seat) => seat.joinOrder)).toEqual([1, 2, 3]);
    expect(room.nextJoinOrder).toBe(4);
    expect(() =>
      joinLobby(
        room,
        { seatId: "seat-4", nickname: "  HOST ", tokenHash: "D".repeat(43) },
        2_000
      )
    ).toThrowError(expect.objectContaining({ code: "NICKNAME_TAKEN" }));
    expect(room.roomVersion).toBe(3);
    expect(room.lastActivityAt).toBe(1_003);
  });

  it("caps a lobby at four seats and rejects duplicate seat IDs", () => {
    const room = roomWithSeats(4);

    expect(() =>
      joinLobby(
        room,
        { seatId: "seat-5", nickname: "Fifth", tokenHash: "E".repeat(43) },
        2_000
      )
    ).toThrowError(expect.objectContaining({ code: "ROOM_FULL" }));
    expect(() =>
      joinLobby(
        roomWithSeats(2),
        { seatId: "seat-2", nickname: "Other", tokenHash: "E".repeat(43) },
        2_000
      )
    ).toThrowError(expect.objectContaining({ code: "SEAT_ALREADY_EXISTS" }));
  });

  it("toggles ready and increments version/activity exactly once", () => {
    const room = roomWithSeats(3);
    const updated = setLobbyReady(room, "seat-2", true, 5_000);

    expect(updated.seats.find((seat) => seat.seatId === "seat-2")?.ready).toBe(true);
    expect(updated.roomVersion).toBe(room.roomVersion + 1);
    expect(updated.lastActivityAt).toBe(5_000);
    expect(updated.expiresAt).toBe(5_000 + DAY_MS);
    expect(room.seats.find((seat) => seat.seatId === "seat-2")?.ready).toBe(false);
  });

  it("leaves voluntarily and transfers host to earliest connected remaining seat", () => {
    const baseRoom = roomWithSeats(4);
    const room = {
      ...baseRoom,
      connectionTickets: [
        { ticketHash: "T".repeat(43), seatId: "seat-1", expiresAt: 20_000 },
        { ticketHash: "U".repeat(43), seatId: "seat-3", expiresAt: 20_000 }
      ]
    };
    const result = leaveLobby(room, "seat-1", ["seat-4", "seat-3"], 8_000);

    expect(result.kind).toBe("updated");
    if (result.kind !== "updated") throw new Error("expected updated room");
    expect(result.room.seats.map((seat) => seat.seatId)).toEqual([
      "seat-2",
      "seat-3",
      "seat-4"
    ]);
    expect(result.room.hostSeatId).toBe("seat-3");
    expect(result.room.connectionTickets).toEqual([room.connectionTickets[1]]);
    expect(result.room.roomVersion).toBe(room.roomVersion + 1);
  });

  it("falls back to earliest remaining seat for host invariant when none are connected", () => {
    const result = leaveLobby(roomWithSeats(3), "seat-1", [], 8_000);

    expect(result.kind).toBe("updated");
    if (result.kind !== "updated") throw new Error("expected updated room");
    expect(result.room.hostSeatId).toBe("seat-2");
  });

  it("uses joinOrder rather than persisted array order for host transfer", () => {
    const room = roomWithSeats(4);
    const reordered = {
      ...room,
      seats: [room.seats[0], room.seats[3], room.seats[2], room.seats[1]]
    };

    const connectedResult = leaveLobby(
      reordered,
      "seat-1",
      ["seat-4", "seat-3"],
      8_000
    );
    const offlineResult = leaveLobby(reordered, "seat-1", [], 8_000);

    expect(connectedResult.kind).toBe("updated");
    expect(offlineResult.kind).toBe("updated");
    if (connectedResult.kind !== "updated" || offlineResult.kind !== "updated") {
      throw new Error("expected updated rooms");
    }
    expect(connectedResult.room.hostSeatId).toBe("seat-3");
    expect(offlineResult.room.hostSeatId).toBe("seat-2");
  });

  it("returns a delete result when the final seat leaves", () => {
    expect(leaveLobby(roomWithSeats(), "seat-1", [], 8_000)).toEqual({
      kind: "deleted"
    });
  });

  it("starts only for the host with three or four all-ready seats", () => {
    const notReady = roomWithSeats(3);
    expect(() => startLobby(notReady, "seat-2", context(), 9_000)).toThrowError(
      expect.objectContaining({ code: "HOST_ONLY" })
    );
    expect(() => startLobby(notReady, "seat-1", context(), 9_000)).toThrowError(
      expect.objectContaining({ code: "NOT_ALL_READY" })
    );
    expect(() =>
      startLobby(
        setLobbyReady(roomWithSeats(2), "seat-1", true, 3_000),
        "seat-1",
        context(),
        9_000
      )
    ).toThrowError(expect.objectContaining({ code: "INVALID_SEAT_COUNT" }));
  });

  it.each([3, 4])("locks and starts a %s-seat match in join order", (count) => {
    let room = roomWithSeats(count);
    for (const seat of room.seats) {
      room = setLobbyReady(room, seat.seatId, true, 4_000 + seat.joinOrder);
    }

    const started = startLobby(room, "seat-1", context(), 9_000);

    expect(started.lifecycle).toBe("playing");
    expect(started.seats.map((seat) => [seat.nickname, seat.playerId])).toEqual(
      Array.from({ length: count }, (_, index) => [
        index === 0 ? "Host" : `Player ${index + 1}`,
        `p${index + 1}`
      ])
    );
    expect(started.matchState?.game.players.map((player) => player.name)).toEqual(
      started.seats.map((seat) => seat.nickname)
    );
    expect(started.roomVersion).toBe(room.roomVersion + 1);
  });

  it("rejects join, ready, leave, and repeat start after seats lock", () => {
    let room = roomWithSeats(3);
    for (const seat of room.seats) {
      room = setLobbyReady(room, seat.seatId, true, 4_000 + seat.joinOrder);
    }
    const started = startLobby(room, "seat-1", context(), 9_000);

    const operations = [
      () =>
        joinLobby(
          started,
          { seatId: "seat-4", nickname: "Late", tokenHash: "Z".repeat(43) },
          10_000
        ),
      () => setLobbyReady(started, "seat-1", false, 10_000),
      () => leaveLobby(started, "seat-1", [], 10_000),
      () => startLobby(started, "seat-1", context(), 10_000)
    ];
    for (const operation of operations) {
      expect(operation).toThrowError(
        expect.objectContaining({ code: "ROOM_ALREADY_STARTED" })
      );
    }
    expect(started.roomVersion).toBe(room.roomVersion + 1);
    expect(started.lastActivityAt).toBe(9_000);
  });

  it("refreshes successful activity once without changing domain state", () => {
    const room = roomWithSeats(3);
    const refreshed = refreshRoomActivity(room, 12_000);

    expect(refreshed.roomVersion).toBe(room.roomVersion + 1);
    expect(refreshed.lastActivityAt).toBe(12_000);
    expect(refreshed.expiresAt).toBe(12_000 + DAY_MS);
    expect(refreshed.seats).toEqual(room.seats);
  });
});

describe("RoomStore", () => {
  it("creates only if empty and reports collisions without overwriting", async () => {
    const storage = new MemoryStorage();
    const store = new RoomStore(storage);
    const first = roomWithSeats();
    const second = { ...roomWithSeats(), roomCode: "XYZ789" };

    await expect(store.createIfEmpty(first)).resolves.toBe("created");
    await expect(store.createIfEmpty(second)).resolves.toBe("collision");
    await expect(store.load(2_000)).resolves.toMatchObject({ roomCode: "ABC234" });
    expect(storage.alarms).toEqual([first.expiresAt]);
  });

  it("returns null for a missing room", async () => {
    await expect(new RoomStore(new MemoryStorage()).load(1_000)).resolves.toBeNull();
  });

  it("rejects incompatible and malformed persisted schema", async () => {
    for (const invalid of [
      { ...roomWithSeats(), schemaVersion: 4 },
      { ...roomWithSeats(), hostSeatId: "missing" },
      { ...roomWithSeats(), presence: [] },
      {
        ...roomWithSeats(),
        seats: [{ ...roomWithSeats().seats[0], normalizedNickname: "HOST" }]
      },
      { ...roomWithSeats(), pendingAuction: { round: 1, bidsBySeatId: {} } },
      {
        ...roomWithSeats(),
        seats: [{ ...roomWithSeats().seats[0], seatToken: "plaintext" }]
      },
      {
        ...roomWithSeats(),
        seats: [{ ...roomWithSeats().seats[0], commandAttemptTimestamps: Array.from({ length: 11 }, (_, index) => index) }]
      },
      {
        ...roomWithSeats(),
        seats: [{ ...roomWithSeats().seats[0], commandAttemptTimestamps: [1, 0] }]
      },
      {
        ...roomWithSeats(),
        seats: [{ ...roomWithSeats().seats[0], commandAttemptTimestamps: [0.5] }]
      }
    ]) {
      const storage = new MemoryStorage();
      storage.values.set(ROOM_RECORD_KEY, invalid);
      await expect(new RoomStore(storage).load(1_000)).rejects.toBeInstanceOf(
        RoomSchemaError
      );
    }
  });

  it("rejects more than 32 total or 8 per-seat persisted tickets", async () => {
    const fourSeatRoom = roomWithSeats(4);
    const totalOverflow = {
      ...fourSeatRoom,
      connectionTickets: Array.from({ length: 33 }, (_, index) => ({
        ticketHash: "T".repeat(43),
        seatId: fourSeatRoom.seats[index % fourSeatRoom.seats.length].seatId,
        expiresAt: 10_000
      }))
    };
    const seatOverflow = {
      ...roomWithSeats(),
      connectionTickets: Array.from({ length: 9 }, () => ({
        ticketHash: "U".repeat(43),
        seatId: "seat-1",
        expiresAt: 10_000
      }))
    };

    expect(MAX_OUTSTANDING_TICKETS_PER_ROOM).toBe(32);
    expect(MAX_OUTSTANDING_TICKETS_PER_SEAT).toBe(8);
    await expect(new RoomStore(new MemoryStorage()).save(totalOverflow))
      .rejects.toBeInstanceOf(RoomSchemaError);
    await expect(new RoomStore(new MemoryStorage()).save(seatOverflow))
      .rejects.toBeInstanceOf(RoomSchemaError);
  });

  it("rejects a ninth outstanding seat ticket without mutation and prunes expired tickets first", async () => {
    const storage = new MemoryStorage();
    const store = new RoomStore(storage);
    await store.createIfEmpty(roomWithSeats());
    for (let index = 0; index < 8; index += 1) {
      await expect(store.issueTicketLatest(HASH, {
        ticketHash: String.fromCharCode(65 + index).repeat(43),
        expiresAt: 10_000
      }, 1_000)).resolves.toMatchObject({ seatId: "seat-1" });
    }
    const before = structuredClone(storage.values.get(ROOM_RECORD_KEY));
    await expect(store.issueTicketLatest(HASH, {
      ticketHash: "Z".repeat(43),
      expiresAt: 10_000
    }, 1_000)).resolves.toBe("rate-limited");
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(before);

    const expiringStorage = new MemoryStorage();
    const expiringRoom = {
      ...roomWithSeats(),
      connectionTickets: [
        ...Array.from({ length: 7 }, (_, index) => ({
          ticketHash: String.fromCharCode(65 + index).repeat(43),
          seatId: "seat-1",
          expiresAt: 10_000
        })),
        { ticketHash: "Y".repeat(43), seatId: "seat-1", expiresAt: 999 }
      ]
    };
    expiringStorage.values.set(ROOM_RECORD_KEY, expiringRoom);
    const issued = await new RoomStore(expiringStorage).issueTicketLatest(HASH, {
      ticketHash: "X".repeat(43),
      expiresAt: 10_000
    }, 1_000);
    expect(issued).toMatchObject({ seatId: "seat-1" });
    expect((issued as { room: PersistedRoom }).room.connectionTickets).toHaveLength(8);
    expect((issued as { room: PersistedRoom }).room.connectionTickets)
      .not.toContainEqual(expect.objectContaining({ expiresAt: 999 }));
  });

  it("normalizes a legacy v1 room whose over-bound excess tickets are expired", async () => {
    const storage = new MemoryStorage();
    const legacy = {
      ...roomWithSeats(),
      connectionTickets: [
        ...Array.from({ length: 8 }, (_, index) => ({
          ticketHash: String.fromCharCode(65 + index).repeat(43),
          seatId: "seat-1",
          expiresAt: 10_000
        })),
        { ticketHash: "Y".repeat(43), seatId: "seat-1", expiresAt: 999 },
        { ticketHash: "Z".repeat(43), seatId: "seat-1", expiresAt: 500 }
      ]
    };
    storage.values.set(ROOM_RECORD_KEY, legacy);

    const loaded = await new RoomStore(storage).load(1_000);

    expect(loaded?.connectionTickets).toHaveLength(8);
    expect((storage.values.get(ROOM_RECORD_KEY) as PersistedRoom).connectionTickets)
      .toEqual(loaded?.connectionTickets);
  });

  it("rejects a legacy v1 room still over-bound after pruning without mutation", async () => {
    const storage = new MemoryStorage();
    const legacy = {
      ...roomWithSeats(),
      connectionTickets: [
        ...Array.from({ length: 9 }, (_, index) => ({
          ticketHash: String.fromCharCode(65 + index).repeat(43),
          seatId: "seat-1",
          expiresAt: 10_000
        })),
        { ticketHash: "Z".repeat(43), seatId: "seat-1", expiresAt: 999 }
      ]
    };
    storage.values.set(ROOM_RECORD_KEY, legacy);
    const before = structuredClone(storage.values.get(ROOM_RECORD_KEY));

    await expect(new RoomStore(storage).load(1_000)).rejects.toBeInstanceOf(RoomSchemaError);
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(before);
  });

  it("rejects malformed nested match state", async () => {
    const room = startedRoom();
    const malformed = {
      ...room,
      matchState: { game: {}, guild: {}, lastDice: null }
    };

    await expect(
      new RoomStore(new MemoryStorage()).save(malformed as PersistedRoom)
    ).rejects.toBeInstanceOf(RoomSchemaError);
  });

  it("rejects locked seats that do not match game player order", async () => {
    const room = startedRoom();
    if (room.matchState === undefined) throw new Error("expected match state");
    const mismatched = {
      ...room,
      matchState: {
        ...room.matchState,
        game: {
          ...room.matchState.game,
          players: [...room.matchState.game.players].reverse()
        }
      }
    };

    await expect(new RoomStore(new MemoryStorage()).save(mismatched)).rejects.toBeInstanceOf(
      RoomSchemaError
    );
  });

  it("rejects room lifecycle that disagrees with game lifecycle", async () => {
    const playing = startedRoom();
    if (playing.matchState === undefined) throw new Error("expected match state");
    const finishedDuringSetup = { ...playing, lifecycle: "finished" as const };
    const playingAfterGameOver = {
      ...playing,
      matchState: {
        ...playing.matchState,
        game: { ...playing.matchState.game, phase: "gameOver" as const }
      }
    };

    const store = new RoomStore(new MemoryStorage());
    await expect(store.save(finishedDuringSetup)).rejects.toBeInstanceOf(RoomSchemaError);
    await expect(store.save(playingAfterGameOver)).rejects.toBeInstanceOf(RoomSchemaError);
  });

  it("accepts a pending auction only during the matching auction round", async () => {
    const room = auctionRoom();
    const store = new RoomStore(new MemoryStorage());

    await expect(store.save(room)).resolves.toBeUndefined();
    await expect(store.load(9_000)).resolves.toEqual(room);
  });

  it("rejects pending bids outside the actual auction phase", async () => {
    const room = auctionRoom();
    if (room.matchState === undefined) throw new Error("expected match state");
    const stale = {
      ...room,
      matchState: {
        ...room.matchState,
        guild: {
          ...room.matchState.guild,
          gathering: { ...room.matchState.guild.gathering, phase: "idle" as const }
        }
      }
    };

    await expect(new RoomStore(new MemoryStorage()).save(stale)).rejects.toBeInstanceOf(
      RoomSchemaError
    );
  });

  it("rejects a pending auction with a stale round", async () => {
    const room = { ...auctionRoom(), pendingAuction: { round: 1, bidsBySeatId: {} } };

    await expect(new RoomStore(new MemoryStorage()).save(room)).rejects.toBeInstanceOf(
      RoomSchemaError
    );
  });

  it("rejects a pending bid above the locked player's available tokens", async () => {
    const room = {
      ...auctionRoom(),
      pendingAuction: { round: 2, bidsBySeatId: { "seat-2": 2 } }
    };

    await expect(new RoomStore(new MemoryStorage()).save(room)).rejects.toBeInstanceOf(
      RoomSchemaError
    );
  });

  it("removes expired tickets during load without changing version/activity", async () => {
    const storage = new MemoryStorage();
    const room = {
      ...roomWithSeats(),
      connectionTickets: [
        { ticketHash: "T".repeat(43), seatId: "seat-1", expiresAt: 999 },
        { ticketHash: "U".repeat(43), seatId: "seat-1", expiresAt: 1_001 }
      ]
    };
    storage.values.set(ROOM_RECORD_KEY, room);

    const loaded = await new RoomStore(storage).load(1_000);

    expect(loaded?.connectionTickets).toEqual([room.connectionTickets[1]]);
    expect(loaded?.roomVersion).toBe(room.roomVersion);
    expect(loaded?.lastActivityAt).toBe(room.lastActivityAt);
    expect(
      (storage.values.get(ROOM_RECORD_KEY) as PersistedRoom).connectionTickets
    ).toEqual([room.connectionTickets[1]]);
  });

  it("saves, schedules expiry, and deletes the single room record", async () => {
    const storage = new MemoryStorage();
    const store = new RoomStore(storage);
    const room = roomWithSeats();

    await store.save(room);
    expect(storage.alarms).toEqual([room.expiresAt]);
    await expect(store.delete()).resolves.toBeUndefined();
    expect(storage.values.has(ROOM_RECORD_KEY)).toBe(false);
  });

  it("serializes creation against an expiry tombstone and concurrent creators", async () => {
    const storage = new MemoryStorage();
    const store = new RoomStore(storage);
    const [left, right] = await Promise.all([
      store.createIfEmpty(roomWithSeats()),
      store.createIfEmpty(roomWithSeats())
    ]);
    expect([left, right].sort()).toEqual(["collision", "created"]);

    await store.handleExpiryAlarm(DAY_MS + 1_000, false, 2 * DAY_MS);
    await expect(store.createIfEmpty(roomWithSeats())).resolves.toBe("collision");
  });

  it("rejects a malformed expiry tombstone instead of treating it as expired", async () => {
    const storage = new MemoryStorage();
    storage.values.set("expired", { schemaVersion: 2, expiredAt: "unsafe" });
    await expect(new RoomStore(storage).lookup(10_000)).rejects.toBeInstanceOf(RoomSchemaError);
  });

});

const ORIGIN = "https://example.com";

class TestRoomNamespace {
  private readonly rooms = new Map<string, { object: RoomDurableObject; state: DurableObjectState }>();
  attempts = 0;

  constructor(private readonly collide = false) {}

  getByName(name: string): any {
    this.attempts += 1;
    if (this.collide) {
      return {
        fetch: () => Promise.resolve(new Response("collision", {
          status: 409,
          headers: { "x-room-code-collision": "1" }
        }))
      };
    }
    let entry = this.rooms.get(name);
    if (entry === undefined) {
      const storage = new MemoryStorage();
      const sockets: WebSocket[] = [];
      const closedSockets = new Set<WebSocket>();
      const closeCalls: Array<{ seatId?: string; code?: number; reason?: string }> = [];
      const state = {
        storage,
        acceptWebSocket: (socket: WebSocket) => {
          socket.accept();
          const close = socket.close.bind(socket);
          Object.defineProperty(socket, "close", {
            configurable: true,
            value: (code?: number, reason?: string) => {
              closedSockets.add(socket);
              closeCalls.push({
                seatId: (socket.deserializeAttachment() as { seatId?: string } | null)?.seatId,
                code,
                reason
              });
              close(code, reason);
            }
          });
          sockets.push(socket);
        },
        getWebSockets: () => sockets.filter((socket) => !closedSockets.has(socket)),
        closeCalls
      } as unknown as DurableObjectState;
      entry = { object: new RoomDurableObject(state, {} as Env), state };
      this.rooms.set(name, entry);
    }
    const object = entry.object;
    return { fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      object.fetch(input instanceof Request ? input : new Request(input, init))
    };
  }

  state(name: string): DurableObjectState {
    const state = this.rooms.get(name)?.state;
    if (state === undefined) throw new Error(`missing room ${name}`);
    return state;
  }

  async seed(name: string, room: PersistedRoom): Promise<void> {
    this.getByName(name);
    await this.state(name).storage.put(ROOM_RECORD_KEY, room);
  }

  evict(name: string): void {
    const entry = this.rooms.get(name);
    if (entry === undefined) throw new Error(`missing room ${name}`);
    entry.object = new RoomDurableObject(entry.state, {} as Env);
  }

  async alarm(name: string): Promise<void> {
    const object = this.rooms.get(name)?.object;
    if (object === undefined) throw new Error(`missing room ${name}`);
    await object.alarm();
  }

  async closeServerSockets(name: string): Promise<void> {
    const entry = this.rooms.get(name);
    if (entry === undefined) throw new Error(`missing room ${name}`);
    for (const socket of entry.state.getWebSockets()) {
      socket.close(1000, "done");
      await entry.object.webSocketClose(socket);
    }
  }

  async errorServerSockets(name: string): Promise<void> {
    const entry = this.rooms.get(name);
    if (entry === undefined) throw new Error(`missing room ${name}`);
    for (const socket of entry.state.getWebSockets()) {
      socket.close(1011, "network error");
      await (entry.object as RoomDurableObject & {
        webSocketError(socket: WebSocket, error: unknown): Promise<void>;
      }).webSocketError(socket, new Error("network error"));
    }
  }
}

const testRooms = new TestRoomNamespace();
const testEnv = {
  ROOMS: testRooms,
  ASSETS: { fetch: () => new Response("asset") }
} as unknown as Env;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("origin", ORIGIN);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return worker.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), testEnv);
}

async function createRoom(nickname = "Host") {
  const response = await api("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ nickname })
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{
    roomCode: string;
    seatId: string;
    seatToken: string;
  }>;
}

async function joinRoom(roomCode: string, nickname: string) {
  const response = await api(`/api/rooms/${roomCode.toLowerCase()}/join`, {
    method: "POST",
    body: JSON.stringify({ nickname })
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{
    roomCode: string;
    seatId: string;
    seatToken: string;
  }>;
}

async function issueTicket(roomCode: string, seatToken: string) {
  const response = await api(`/api/rooms/${roomCode}/connection-ticket`, {
    method: "POST",
    headers: { authorization: `Bearer ${seatToken}` }
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ ticket: string; expiresInMs: number }>;
}

async function connect(roomCode: string, ticket: string): Promise<WebSocket> {
  const response = await api(
    `/api/rooms/${roomCode}/connect?ticket=${encodeURIComponent(ticket)}`,
    { headers: { upgrade: "websocket" } }
  );
  if (response.status !== 101) {
    throw new Error(`upgrade ${response.status}: ${await response.text()}`);
  }
  const socket = response.webSocket;
  if (socket === null) throw new Error("expected upgraded WebSocket");
  socket.accept();
  return socket;
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("message", (event) => {
      try {
        resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    socket.addEventListener("error", () => reject(new Error("socket error")), { once: true });
  });
}

async function nextMessageOfType(
  socket: WebSocket,
  type: string
): Promise<Record<string, unknown>> {
  return Promise.race([
    (async () => {
      for (let index = 0; index < 6; index += 1) {
        const message = await nextMessage(socket);
        if (message.type === type) return message;
      }
      throw new Error(`did not receive ${type}`);
    })(),
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 500);
    })
  ]);
}

async function connectAndDrain(
  openSockets: readonly WebSocket[],
  roomCode: string,
  seatToken: string
): Promise<WebSocket> {
  const existingPresence = openSockets.map((socket) =>
    nextMessageOfType(socket, "presence.changed")
  );
  const socket = await connect(roomCode, (await issueTicket(roomCode, seatToken)).ticket);
  await Promise.all([
    ...existingPresence,
    nextMessageOfType(socket, "presence.changed")
  ]);
  return socket;
}

function recordMessages(socket: WebSocket): {
  messages: Record<string, unknown>[];
  stop: () => void;
} {
  const messages: Record<string, unknown>[] = [];
  const listener = (event: MessageEvent) => {
    messages.push(JSON.parse(String(event.data)) as Record<string, unknown>);
  };
  socket.addEventListener("message", listener);
  return {
    messages,
    stop: () => socket.removeEventListener("message", listener)
  };
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function closeSocket(socket: WebSocket): void {
  socket.close(1000, "done");
}

describe("room HTTP routes and authenticated sockets", () => {
  it("covers persisted room routes, errors, tickets, attachments, and presence", async () => {
    {
      const stub = env.ROOMS.getByName("task-10-real-room-store");
      const now = Date.now();
      const room = roomWithSeats(1, now);
      await runInDurableObject(stub, async (_instance, state) => {
        const store = new RoomStore(state.storage);
        expect(await store.createIfEmpty(room)).toBe("created");
        expect(await store.load(now)).toEqual(room);
        expect(await state.storage.getAlarm()).toBe(room.expiresAt);
        await store.delete();
        expect(await store.load(now)).toBeNull();
      });
    }

    {
    const collisions = new TestRoomNamespace(true);
    const collisionResponse = await worker.fetch(new Request(`${ORIGIN}/api/rooms`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ nickname: "Collision Host" })
    }), { ...testEnv, ROOMS: collisions } as unknown as Env);
    expect(collisions.attempts).toBe(8);
    expect(collisionResponse.status).toBe(500);

    const host = await createRoom(" Host ");
    expect(host.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(host.seatId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(host.seatToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const guest = await joinRoom(host.roomCode, "Guest");
    expect(guest.roomCode).toBe(host.roomCode);

    const duplicate = await api(`/api/rooms/${host.roomCode}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname: " guest " })
    });
    expect(duplicate.status).toBe(422);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { code: "RULE_VIOLATION", retryable: false }
    });

    const invalidDelete = await api(
      `/api/rooms/${host.roomCode}/seats/${guest.seatId}`,
      { method: "DELETE", headers: { authorization: `Bearer ${host.seatToken}` } }
    );
    expect(invalidDelete.status).toBe(401);

    const deleted = await api(`/api/rooms/${host.roomCode}/seats/${guest.seatId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${guest.seatToken}` }
    });
    expect(deleted.status).toBe(204);
    }

    {
    const missing = await api("/api/rooms/ABC234/join", {
      method: "POST",
      body: JSON.stringify({ nickname: "Guest" })
    });
    expect(missing.status).toBe(404);

    await testRooms.seed("ABC234", startedRoom());
    const started = await api("/api/rooms/abc234/join", {
      method: "POST",
      body: JSON.stringify({ nickname: "Late" })
    });
    expect(started.status).toBe(409);
    await expect(started.json()).resolves.toMatchObject({
      error: { code: "ROOM_ALREADY_STARTED" }
    });

    const startedToken = "S".repeat(43);
    const startedForDelete = startedRoom();
    startedForDelete.seats[0].tokenHash = await hashSecret(startedToken);
    await testRooms.seed("ABC234", startedForDelete);
    const lockedDelete = await api(
      `/api/rooms/ABC234/seats/${startedForDelete.seats[0].seatId}`,
      { method: "DELETE", headers: { authorization: `Bearer ${startedToken}` } }
    );
    expect(lockedDelete.status).toBe(403);
    await expect(lockedDelete.json()).resolves.toEqual({
      error: { code: "COMMAND_NOT_ALLOWED", params: {}, retryable: false }
    });

    const malformed = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ nickname: "", extra: true })
    });
    expect(malformed.status).toBe(422);

    const invalidCode = await api("/api/rooms/ABC01I/join", {
      method: "POST",
      body: JSON.stringify({ nickname: "Guest" })
    });
    expect(invalidCode.status).toBe(422);

    const host = await createRoom("Full Host");
    await joinRoom(host.roomCode, "Two");
    await joinRoom(host.roomCode, "Three");
    await joinRoom(host.roomCode, "Four");
    const full = await api(`/api/rooms/${host.roomCode}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname: "Five" })
    });
    expect(full.status).toBe(409);
    await expect(full.json()).resolves.toMatchObject({ error: { code: "ROOM_FULL" } });
    }

    {
    const host = await createRoom("Socket Host");
    const invalidAuth = await api(`/api/rooms/${host.roomCode}/connection-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${"x".repeat(43)}` }
    });
    expect(invalidAuth.status).toBe(401);

    const issued = await issueTicket(host.roomCode, host.seatToken);
    expect(issued.expiresInMs).toBe(30_000);
    expect(issued.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const first = await connect(host.roomCode, issued.ticket);
    const snapshot = await nextMessage(first);
    expect(snapshot).toMatchObject({
      type: "room.snapshot",
      schemaVersion: 3,
      lifecycle: "lobby",
      privateState: { seatId: host.seatId, seatTokenPresent: true }
    });

    const consumed = await api(
      `/api/rooms/${host.roomCode}/connect?ticket=${encodeURIComponent(issued.ticket)}`,
      { headers: { upgrade: "websocket" } }
    );
    expect(consumed.status).toBe(401);
    await expect(consumed.json()).resolves.toMatchObject({
      error: { code: "CONNECTION_TICKET_EXPIRED", retryable: true }
    });
    closeSocket(first);

    const expiring = await issueTicket(host.roomCode, host.seatToken);
    const ticketHash = await import("../../worker/crypto").then(({ hashSecret }) =>
      hashSecret(expiring.ticket)
    );
    const expiringState = testRooms.state(host.roomCode);
    const expiringStore = new RoomStore(expiringState.storage);
    const expiringRoom = await expiringStore.load(Date.now());
    if (expiringRoom === null) throw new Error("expected room");
    await expiringState.storage.put(ROOM_RECORD_KEY, {
      ...expiringRoom,
      connectionTickets: expiringRoom.connectionTickets.map((candidate) =>
        candidate.ticketHash === ticketHash ? { ...candidate, expiresAt: Date.now() - 1 } : candidate
      )
    });
    const expired = await api(
      `/api/rooms/${host.roomCode}/connect?ticket=${encodeURIComponent(expiring.ticket)}`,
      { headers: { upgrade: "websocket" } }
    );
    expect(expired.status).toBe(401);
    }

    {
    const host = await createRoom("Presence Host");
    const firstTicket = await issueTicket(host.roomCode, host.seatToken);
    const first = await connect(host.roomCode, firstTicket.ticket);
    await nextMessage(first);

    const secondTicket = await issueTicket(host.roomCode, host.seatToken);
    const second = await connect(host.roomCode, secondTicket.ticket);
    const secondSnapshot = await nextMessage(second);
    expect(secondSnapshot.presence).toEqual([
      { seatId: host.seatId, connectionCount: 2, online: true }
    ]);

    const state = testRooms.state(host.roomCode);
    {
      const sockets = state.getWebSockets();
      expect(sockets).toHaveLength(2);
      for (const socket of sockets) {
        expect(socket.deserializeAttachment()).toEqual({
          seatId: host.seatId,
          connectionId: expect.any(String),
          connectedAt: expect.any(Number)
        });
        const serialized = JSON.stringify(socket.deserializeAttachment());
        expect(serialized).not.toContain(host.seatToken);
        expect(serialized).not.toContain(firstTicket.ticket);
      }
      const room = await new RoomStore(state.storage).load(Date.now());
      expect(room).not.toHaveProperty("presence");
    }

    closeSocket(first);
    closeSocket(second);
    }

    {
      const host = await createRoom("Concurrent Host");
      await joinRoom(host.roomCode, "Concurrent Two");
      await joinRoom(host.roomCode, "Concurrent Three");
      const [left, right] = await Promise.all([
        api(`/api/rooms/${host.roomCode}/join`, {
          method: "POST",
          body: JSON.stringify({ nickname: "Concurrent Four A" })
        }),
        api(`/api/rooms/${host.roomCode}/join`, {
          method: "POST",
          body: JSON.stringify({ nickname: "Concurrent Four B" })
        })
      ]);
      expect([left.status, right.status].sort()).toEqual([201, 409]);
      const room = await new RoomStore(testRooms.state(host.roomCode).storage).load(Date.now());
      expect(room?.seats).toHaveLength(4);
    }

    {
      const host = await createRoom("Join Leave Host");
      const leaving = await joinRoom(host.roomCode, "Leaving Guest");
      const [joined, left] = await Promise.all([
        api(`/api/rooms/${host.roomCode}/join`, {
          method: "POST",
          body: JSON.stringify({ nickname: "Joining Guest" })
        }),
        api(`/api/rooms/${host.roomCode}/seats/${leaving.seatId}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${leaving.seatToken}` }
        })
      ]);
      expect(joined.status).toBe(201);
      expect(left.status).toBe(204);
      const room = await new RoomStore(testRooms.state(host.roomCode).storage).load(Date.now());
      expect(room?.seats.map((seat) => seat.nickname)).toEqual([
        "Join Leave Host",
        "Joining Guest"
      ]);
    }

    {
      const host = await createRoom("Ticket Leave Host");
      const leaving = await joinRoom(host.roomCode, "Ticket Leaving Guest");
      const [ticketResponse, leaveResponse] = await Promise.all([
        api(`/api/rooms/${host.roomCode}/connection-ticket`, {
          method: "POST",
          headers: { authorization: `Bearer ${leaving.seatToken}` }
        }),
        api(`/api/rooms/${host.roomCode}/seats/${leaving.seatId}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${leaving.seatToken}` }
        })
      ]);
      expect([201, 401]).toContain(ticketResponse.status);
      expect(leaveResponse.status).toBe(204);
      const room = await new RoomStore(testRooms.state(host.roomCode).storage).load(Date.now());
      expect(room?.seats.some((seat) => seat.seatId === leaving.seatId)).toBe(false);
      expect(room?.connectionTickets.some((ticket) => ticket.seatId === leaving.seatId)).toBe(false);
    }

    {
      const host = await createRoom("Upgrade Race Host");
      const issued = await issueTicket(host.roomCode, host.seatToken);
      const [left, right] = await Promise.all([
        api(`/api/rooms/${host.roomCode}/connect?ticket=${issued.ticket}`, {
          headers: { upgrade: "websocket" }
        }),
        api(`/api/rooms/${host.roomCode}/connect?ticket=${issued.ticket}`, {
          headers: { upgrade: "websocket" }
        })
      ]);
      expect([left.status, right.status].sort()).toEqual([101, 401]);
      for (const response of [left, right]) {
        if (response.webSocket) {
          response.webSocket.accept();
          closeSocket(response.webSocket);
        }
      }
    }

    {
      const host = await createRoom("Socket Leave Host");
      const guest = await joinRoom(host.roomCode, "Socket Leave Guest");
      const hostSocket = await connect(host.roomCode, (await issueTicket(host.roomCode, host.seatToken)).ticket);
      await nextMessageOfType(hostSocket, "presence.changed");
      const firstPresence = nextMessageOfType(hostSocket, "presence.changed");
      const guestSocketOne = await connect(host.roomCode, (await issueTicket(host.roomCode, guest.seatToken)).ticket);
      await Promise.all([
        firstPresence,
        nextMessageOfType(guestSocketOne, "presence.changed")
      ]);
      const secondPresence = nextMessageOfType(hostSocket, "presence.changed");
      const guestSocketTwo = await connect(host.roomCode, (await issueTicket(host.roomCode, guest.seatToken)).ticket);
      await Promise.all([
        secondPresence,
        nextMessageOfType(guestSocketTwo, "presence.changed")
      ]);
      const changedSnapshot = nextMessageOfType(hostSocket, "room.snapshot");
      const deleted = await api(`/api/rooms/${host.roomCode}/seats/${guest.seatId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${guest.seatToken}` }
      });
      expect(deleted.status).toBe(204);
      const closeCalls = (testRooms.state(host.roomCode) as unknown as {
        closeCalls: Array<{ seatId?: string; code?: number; reason?: string }>;
      }).closeCalls;
      expect(closeCalls.filter((call) => call.seatId === guest.seatId)).toEqual([
        { seatId: guest.seatId, code: 4001, reason: "SEAT_LEFT" },
        { seatId: guest.seatId, code: 4001, reason: "SEAT_LEFT" }
      ]);
      expect(closeCalls.some((call) => call.seatId === host.seatId)).toBe(false);
      await changedSnapshot;
      const presence = await nextMessageOfType(hostSocket, "presence.changed");
      expect(presence).toEqual({
        type: "presence.changed",
        presence: [{ seatId: host.seatId, connectionCount: 1, online: true }]
      });
      closeSocket(hostSocket);
    }
  });

  it("rate-limits the eleventh successful ticket in two seconds without charging invalid credentials", async () => {
    const host = await createRoom("Ticket Burst Host");
    for (let index = 0; index < 3; index += 1) {
      const invalid = await api(`/api/rooms/${host.roomCode}/connection-ticket`, {
        method: "POST",
        headers: { authorization: `Bearer ${"x".repeat(43)}` }
      });
      expect(invalid.status).toBe(401);
    }

    for (let index = 0; index < 10; index += 1) {
      const issued = await issueTicket(host.roomCode, host.seatToken);
      const socket = await connect(host.roomCode, issued.ticket);
      closeSocket(socket);
    }

    const limited = await api(`/api/rooms/${host.roomCode}/connection-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${host.seatToken}` }
    });
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: { code: "RATE_LIMITED", params: {}, retryable: true }
    });
  });

  it("charges saturated authenticated admissions and stops ticket crypto and storage after ten", async () => {
    const host = await createRoom("Saturated Host");
    const storage = testRooms.state(host.roomCode).storage as unknown as MemoryStorage;
    const random = vi.spyOn(crypto, "getRandomValues");
    try {
      for (let index = 0; index < 11; index += 1) {
        const invalid = await api(`/api/rooms/${host.roomCode}/connection-ticket`, {
          method: "POST",
          headers: { authorization: `Bearer ${"x".repeat(43)}` }
        });
        expect(invalid.status).toBe(401);
      }

      for (let index = 0; index < 8; index += 1) {
        await issueTicket(host.roomCode, host.seatToken);
      }
      for (let index = 0; index < 2; index += 1) {
        const saturated = await api(`/api/rooms/${host.roomCode}/connection-ticket`, {
          method: "POST",
          headers: { authorization: `Bearer ${host.seatToken}` }
        });
        expect(saturated.status).toBe(429);
      }

      const transactionsAtLimit = storage.transactionCount;
      const randomCallsAtLimit = random.mock.calls.length;
      const rejectedBeforeWork = await api(`/api/rooms/${host.roomCode}/connection-ticket`, {
        method: "POST",
        headers: { authorization: `Bearer ${host.seatToken}` }
      });

      expect(rejectedBeforeWork.status).toBe(429);
      await expect(rejectedBeforeWork.json()).resolves.toEqual({
        error: { code: "RATE_LIMITED", params: {}, retryable: true }
      });
      expect(storage.transactionCount).toBe(transactionsAtLimit);
      expect(random.mock.calls).toHaveLength(randomCallsAtLimit);
    } finally {
      random.mockRestore();
    }
  });
});

describe("room membership snapshot convergence", () => {
  it("broadcasts caller-specific snapshots for join, upgrade, and host leave", async () => {
    const host = await createRoom("Convergence Host");
    const hostSocketOne = await connect(
      host.roomCode,
      (await issueTicket(host.roomCode, host.seatToken)).ticket
    );
    await nextMessageOfType(hostSocketOne, "presence.changed");

    const hostSocketTwo = await connect(
      host.roomCode,
      (await issueTicket(host.roomCode, host.seatToken)).ticket
    );
    await Promise.all([
      nextMessageOfType(hostSocketOne, "presence.changed"),
      nextMessageOfType(hostSocketTwo, "presence.changed")
    ]);

    const joinedSnapshotOne = nextMessageOfType(hostSocketOne, "room.snapshot");
    const joinedSnapshotTwo = nextMessageOfType(hostSocketTwo, "room.snapshot");
    const guest = await joinRoom(host.roomCode, "Convergence Guest");
    const [hostViewOne, hostViewTwo] = await Promise.all([
      joinedSnapshotOne,
      joinedSnapshotTwo
    ]);
    for (const hostView of [hostViewOne, hostViewTwo]) {
      expect(hostView).toMatchObject({
        type: "room.snapshot",
        privateState: { seatId: host.seatId },
        publicState: {
          hostSeatId: host.seatId,
          seats: [
            { seatId: host.seatId, nickname: "Convergence Host" },
            { seatId: guest.seatId, nickname: "Convergence Guest" }
          ]
        }
      });
      expect(new TextEncoder().encode(JSON.stringify(hostView)).byteLength).toBeLessThanOrEqual(
        MAX_WIRE_BYTES
      );
    }
    expect(hostViewOne.roomVersion).toBe(hostViewTwo.roomVersion);
    await Promise.all([
      nextMessageOfType(hostSocketOne, "presence.changed"),
      nextMessageOfType(hostSocketTwo, "presence.changed")
    ]);

    const upgradedHostOne = nextMessageOfType(hostSocketOne, "room.snapshot");
    const upgradedHostTwo = nextMessageOfType(hostSocketTwo, "room.snapshot");
    const guestSocket = await connect(
      host.roomCode,
      (await issueTicket(host.roomCode, guest.seatToken)).ticket
    );
    const [hostUpgradeOne, hostUpgradeTwo, guestUpgrade] = await Promise.all([
      upgradedHostOne,
      upgradedHostTwo,
      nextMessageOfType(guestSocket, "room.snapshot")
    ]);
    expect(hostUpgradeOne.privateState).toMatchObject({ seatId: host.seatId });
    expect(hostUpgradeTwo.privateState).toMatchObject({ seatId: host.seatId });
    expect(guestUpgrade.privateState).toMatchObject({ seatId: guest.seatId });
    expect(new Set([
      hostUpgradeOne.roomVersion,
      hostUpgradeTwo.roomVersion,
      guestUpgrade.roomVersion
    ])).toEqual(new Set([guestUpgrade.roomVersion]));
    expect(guestUpgrade.roomVersion).toBe(Number(hostViewOne.roomVersion) + 1);
    for (const message of [hostUpgradeOne, hostUpgradeTwo, guestUpgrade]) {
      const wire = JSON.stringify(message);
      expect(wire).not.toContain(host.seatToken);
      expect(wire).not.toContain(guest.seatToken);
      expect(wire).not.toContain("acceptedCommandIds");
    }

    const presence = await Promise.all([
      nextMessageOfType(hostSocketOne, "presence.changed"),
      nextMessageOfType(hostSocketTwo, "presence.changed"),
      nextMessageOfType(guestSocket, "presence.changed")
    ]);
    expect(presence[0].presence).toEqual([
      { seatId: host.seatId, connectionCount: 2, online: true },
      { seatId: guest.seatId, connectionCount: 1, online: true }
    ]);

    const guestAfterLeave = nextMessageOfType(guestSocket, "room.snapshot");
    const deleted = await api(`/api/rooms/${host.roomCode}/seats/${host.seatId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${host.seatToken}` }
    });
    expect(deleted.status).toBe(204);
    await expect(guestAfterLeave).resolves.toMatchObject({
      type: "room.snapshot",
      roomVersion: Number(guestUpgrade.roomVersion) + 1,
      privateState: { seatId: guest.seatId },
      publicState: {
        hostSeatId: guest.seatId,
        seats: [{ seatId: guest.seatId, nickname: "Convergence Guest" }]
      }
    });
    await expect(nextMessageOfType(guestSocket, "presence.changed")).resolves.toMatchObject({
      presence: [{ seatId: guest.seatId, connectionCount: 1, online: true }]
    });
    closeSocket(guestSocket);
  });

  it("isolates one failed socket send while updating every other connection", async () => {
    const host = await createRoom("Send Failure Host");
    const first = await connect(
      host.roomCode,
      (await issueTicket(host.roomCode, host.seatToken)).ticket
    );
    await nextMessageOfType(first, "presence.changed");
    const second = await connect(
      host.roomCode,
      (await issueTicket(host.roomCode, host.seatToken)).ticket
    );
    await Promise.all([
      nextMessageOfType(first, "presence.changed"),
      nextMessageOfType(second, "presence.changed")
    ]);

    const serverSockets = testRooms.state(host.roomCode).getWebSockets();
    Object.defineProperty(serverSockets[0], "send", {
      value: () => {
        throw new Error("simulated send failure");
      }
    });

    const survivingSnapshot = nextMessageOfType(second, "room.snapshot");
    const response = await api(`/api/rooms/${host.roomCode}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname: "Still Updated" })
    });
    expect(response.status).toBe(201);
    await expect(survivingSnapshot).resolves.toMatchObject({
      type: "room.snapshot",
      publicState: { seats: [{}, { nickname: "Still Updated" }] }
    });
    await expect(nextMessageOfType(second, "presence.changed")).resolves.toMatchObject({
      type: "presence.changed"
    });
    closeSocket(first);
    closeSocket(second);
  });

  it("closes malformed, unknown, and unreadable attachments without blocking healthy tabs", async () => {
    const host = await createRoom("Recipient Host");
    const healthyOne = await connectAndDrain([], host.roomCode, host.seatToken);
    const healthyTwo = await connectAndDrain([healthyOne], host.roomCode, host.seatToken);
    const malformed = await connectAndDrain(
      [healthyOne, healthyTwo],
      host.roomCode,
      host.seatToken
    );
    const unknown = await connectAndDrain(
      [healthyOne, healthyTwo, malformed],
      host.roomCode,
      host.seatToken
    );
    const unreadable = await connectAndDrain(
      [healthyOne, healthyTwo, malformed, unknown],
      host.roomCode,
      host.seatToken
    );

    const guestPresence = [healthyOne, healthyTwo, malformed, unknown, unreadable].map(
      (socket) => nextMessageOfType(socket, "presence.changed")
    );
    const guest = await joinRoom(host.roomCode, "Recipient Guest");
    await Promise.all(guestPresence);
    const guestSocket = await connectAndDrain(
      [healthyOne, healthyTwo, malformed, unknown, unreadable],
      host.roomCode,
      guest.seatToken
    );

    const serverSockets = testRooms.state(host.roomCode).getWebSockets();
    serverSockets[2].serializeAttachment({
      seatId: host.seatId,
      connectionId: crypto.randomUUID(),
      connectedAt: Date.now(),
      extra: "not allowed"
    });
    serverSockets[3].serializeAttachment({
      seatId: "removed-seat",
      connectionId: crypto.randomUUID(),
      connectedAt: Date.now()
    });
    Object.defineProperty(serverSockets[4], "deserializeAttachment", {
      value: () => {
        throw new Error("unreadable attachment");
      }
    });

    const malformedMessages = recordMessages(malformed);
    const unknownMessages = recordMessages(unknown);
    const unreadableMessages = recordMessages(unreadable);
    const healthySnapshots = [healthyOne, healthyTwo, guestSocket].map((socket) =>
      nextMessageOfType(socket, "room.snapshot")
    );
    const response = await api(`/api/rooms/${host.roomCode}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname: "Recipient Third" })
    });
    expect(response.status).toBe(201);
    await Promise.all(healthySnapshots);
    const healthyPresence = await Promise.all(
      [healthyOne, healthyTwo, guestSocket].map((socket) =>
        nextMessageOfType(socket, "presence.changed")
      )
    );
    expect(healthyPresence[0].presence).toEqual([
      { seatId: host.seatId, connectionCount: 2, online: true },
      { seatId: guest.seatId, connectionCount: 1, online: true },
      { seatId: expect.any(String), connectionCount: 0, online: false }
    ]);
    await nextTask();
    expect(malformedMessages.messages).toEqual([]);
    expect(unknownMessages.messages).toEqual([]);
    expect(unreadableMessages.messages).toEqual([]);
    malformedMessages.stop();
    unknownMessages.stop();
    unreadableMessages.stop();

    const closeCalls = (testRooms.state(host.roomCode) as unknown as {
      closeCalls: Array<{ seatId?: string; code?: number; reason?: string }>;
    }).closeCalls;
    expect(closeCalls).toContainEqual({
      seatId: host.seatId,
      code: 4003,
      reason: "INVALID_ATTACHMENT"
    });
    expect(closeCalls).toContainEqual({
      seatId: "removed-seat",
      code: 4001,
      reason: "SEAT_LEFT"
    });
    closeSocket(healthyOne);
    closeSocket(healthyTwo);
    closeSocket(guestSocket);
  });

  it("excludes a departed peer whose close throws while converging healthy peers", async () => {
    const host = await createRoom("Departed Host");
    const hostSocket = await connectAndDrain([], host.roomCode, host.seatToken);
    const hostJoinPresence = nextMessageOfType(hostSocket, "presence.changed");
    const guest = await joinRoom(host.roomCode, "Departed Guest");
    await hostJoinPresence;
    const guestOne = await connectAndDrain([hostSocket], host.roomCode, guest.seatToken);
    const guestTwo = await connectAndDrain(
      [hostSocket, guestOne],
      host.roomCode,
      guest.seatToken
    );

    const serverSockets = testRooms.state(host.roomCode).getWebSockets();
    Object.defineProperty(serverSockets[2], "close", {
      value: () => {
        throw new Error("simulated close failure");
      }
    });
    const departedMessages = recordMessages(guestTwo);
    const hostSnapshot = nextMessageOfType(hostSocket, "room.snapshot");
    const response = await api(`/api/rooms/${host.roomCode}/seats/${guest.seatId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${guest.seatToken}` }
    });
    expect(response.status).toBe(204);
    await expect(hostSnapshot).resolves.toMatchObject({
      publicState: { seats: [{ seatId: host.seatId }] }
    });
    await expect(nextMessageOfType(hostSocket, "presence.changed")).resolves.toMatchObject({
      presence: [{ seatId: host.seatId, connectionCount: 1, online: true }]
    });
    await nextTask();
    expect(departedMessages.messages).toEqual([]);
    departedMessages.stop();
    closeSocket(hostSocket);
    closeSocket(guestTwo);
  });
});

describe("room eviction recovery and expiry alarms", () => {
  it("uses real Durable Object storage and the production alarm handler for atomic expiry", async () => {
    const stub = env.ROOMS.getByName("task-12-real-expiry-fix");
    await runInDurableObject(stub, async (instance, state) => {
      const expiredRoom = roomWithSeats(1, Date.now() - DAY_MS - 1_000);
      await new RoomStore(state.storage).save(expiredRoom);
      expect(await state.storage.getAlarm()).toBeLessThanOrEqual(Date.now());

      await instance.alarm();

      expect(await state.storage.get(ROOM_RECORD_KEY)).toBeUndefined();
      expect(await state.storage.get("expired")).toEqual({
        schemaVersion: 1,
        expiredAt: expect.any(Number)
      });
      expect(await state.storage.getAlarm()).toBeNull();
      const response = await instance.fetch(new Request(
        "https://example.com/api/rooms/ABC234/join",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nickname: "Late Guest" })
        }
      ));
      expect(response.status).toBe(410);
    });
  });

  it("does not delete a room refreshed after the alarm began but before its expiry transaction", async () => {
    const storage = new MemoryStorage();
    const now = Date.now();
    const stale = roomWithSeats(1, now - DAY_MS - 1_000);
    const refreshed = refreshRoomActivity(stale, now + 5_000);
    await new RoomStore(storage).save(stale);
    storage.beforeNextTransaction = async () => {
      await storage.put(ROOM_RECORD_KEY, refreshed);
      await storage.setAlarm(refreshed.expiresAt);
    };
    const state = {
      storage,
      getWebSockets: () => []
    } as unknown as DurableObjectState;

    await new RoomDurableObject(state, {} as Env).alarm();

    expect(await new RoomStore(storage).load(now)).toEqual(refreshed);
    expect(await storage.get("expired")).toBeUndefined();
    expect(storage.alarm).toBe(refreshed.expiresAt);
  });

  it("returns an explicit incompatible result for an unsafe stored schema after reconstruction", async () => {
    const rooms = new TestRoomNamespace();
    await rooms.seed("incompatible-recovery", roomWithSeats());
    await rooms.state("incompatible-recovery").storage.put(ROOM_RECORD_KEY, {
      ...roomWithSeats(),
      schemaVersion: 4
    });
    rooms.evict("incompatible-recovery");

    const response = await rooms.getByName("incompatible-recovery").fetch(new Request(
      "https://example.com/api/rooms/ABC234/join",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: "Unsafe Upgrade" })
      }
    ));

    expect(response.status).toBe(426);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PROTOCOL_INCOMPATIBLE",
        params: { expected: 3 },
        retryable: false
      }
    });
  });

  it("deletes an inactive room through the production alarm API and retains only a secret-free expiry tombstone", async () => {
    const rooms = new TestRoomNamespace();
    const expiredRoom = roomWithSeats(1, Date.now() - DAY_MS - 1_000);
    await rooms.seed("task-12-expired-room", expiredRoom);
    const storage = rooms.state("task-12-expired-room").storage as unknown as MemoryStorage;
    await storage.setAlarm(expiredRoom.expiresAt);
    await rooms.alarm("task-12-expired-room");
    expect(await storage.get(ROOM_RECORD_KEY)).toBeUndefined();
    const tombstone = await storage.get("expired");
    expect(tombstone).toEqual({ schemaVersion: 1, expiredAt: expect.any(Number) });
    expect(JSON.stringify(tombstone)).not.toContain(HASH);
    expect(storage.alarm).toBeNull();

    const stub = rooms.getByName("task-12-expired-room");

    const response = await stub.fetch(new Request("https://example.com/api/rooms/ABC234/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: "Late Guest" })
    }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ROOM_EXPIRED", params: {}, retryable: false }
    });

    const expiredRequests = [
      new Request("https://example.com/api/rooms/ABC234/connection-ticket", {
        method: "POST",
        headers: { authorization: `Bearer ${HASH}` }
      }),
      new Request(`https://example.com/api/rooms/ABC234/connect?ticket=${HASH}`, {
        headers: { upgrade: "websocket" }
      }),
      new Request("https://example.com/api/rooms/ABC234/seats/seat-1", {
        method: "DELETE",
        headers: { authorization: `Bearer ${HASH}` }
      })
    ];
    for (const request of expiredRequests) {
      const expiredResponse = await stub.fetch(request);
      expect(expiredResponse.status).toBe(410);
      await expect(expiredResponse.json()).resolves.toMatchObject({
        error: { code: "ROOM_EXPIRED", retryable: false }
      });
    }
  });

  it("recovers lobby, match, tickets, and pending sealed bids in a fresh instance", async () => {
    const rooms = new TestRoomNamespace();
    const now = Date.now();

    const lobby = refreshRoomActivity(roomWithSeats(2), now);
    await rooms.seed("recovery-lobby", lobby);
    rooms.evict("recovery-lobby");
    const joined = await rooms.getByName("recovery-lobby").fetch(new Request(
      "https://example.com/api/rooms/ABC234/join",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: "Recovered Guest" })
      }
    ));
    expect(joined.status).toBe(201);
    expect((await new RoomStore(rooms.state("recovery-lobby").storage).load(now))?.seats)
      .toHaveLength(3);

    const ticket = "R".repeat(43);
    const playing = {
      ...refreshRoomActivity(auctionRoom(), now),
      connectionTickets: [{
        ticketHash: await hashSecret(ticket),
        seatId: "seat-1",
        expiresAt: now + 30_000
      }]
    };
    await rooms.seed("recovery-playing", playing);
    rooms.evict("recovery-playing");
    const connected = await rooms.getByName("recovery-playing").fetch(new Request(
      `https://example.com/api/rooms/ABC234/connect?ticket=${ticket}`,
      { headers: { upgrade: "websocket" } }
    ));
    expect(connected.status).toBe(101);
    const socket = connected.webSocket;
    if (socket === null) throw new Error("expected recovered socket");
    socket.accept();
    await expect(nextMessage(socket)).resolves.toMatchObject({
      type: "room.snapshot",
      lifecycle: "playing"
    });
    const recovered = await new RoomStore(rooms.state("recovery-playing").storage).load(now);
    expect(recovered?.matchState).toEqual(playing.matchState);
    expect(recovered?.pendingAuction).toEqual(playing.pendingAuction);
    expect(recovered?.connectionTickets).toEqual([]);
    closeSocket(socket);
  });

  it("defers an expired room while an open socket remains without persisting presence", async () => {
    const rooms = new TestRoomNamespace();
    const now = Date.now();
    const token = "Q".repeat(43);
    const activeRoom = {
      ...refreshRoomActivity(roomWithSeats(), now),
      connectionTickets: [{
        ticketHash: await hashSecret(token),
        seatId: "seat-1",
        expiresAt: now + 30_000
      }]
    };
    await rooms.seed("connected-expiry", activeRoom);
    const response = await rooms.getByName("connected-expiry").fetch(new Request(
      `https://example.com/api/rooms/ABC234/connect?ticket=${token}`,
      { headers: { upgrade: "websocket" } }
    ));
    const client = response.webSocket;
    if (client === null) throw new Error("expected socket");
    client.accept();
    await nextMessage(client);

    const storage = rooms.state("connected-expiry").storage;
    const expired = refreshRoomActivity(
      (await new RoomStore(storage).load(now))!,
      now - DAY_MS - 1_000
    );
    await storage.put(ROOM_RECORD_KEY, expired);
    await rooms.alarm("connected-expiry");

    const persisted = await new RoomStore(storage).load(now);
    expect(persisted).toEqual(expired);
    expect(persisted).not.toHaveProperty("presence");
    const memoryStorage = storage as unknown as MemoryStorage;
    expect(memoryStorage.alarm).toBeGreaterThanOrEqual(now + DAY_MS);
    await rooms.closeServerSockets("connected-expiry");
    expect(memoryStorage.alarm).toBeLessThanOrEqual(Date.now());
    closeSocket(client);
  });

  it("restores immediate expiry when the final socket ends with an error", async () => {
    const rooms = new TestRoomNamespace();
    const now = Date.now();
    const token = "E".repeat(43);
    const activeRoom = {
      ...refreshRoomActivity(roomWithSeats(), now),
      connectionTickets: [{
        ticketHash: await hashSecret(token),
        seatId: "seat-1",
        expiresAt: now + 30_000
      }]
    };
    await rooms.seed("socket-error-expiry", activeRoom);
    const response = await rooms.getByName("socket-error-expiry").fetch(new Request(
      `https://example.com/api/rooms/ABC234/connect?ticket=${token}`,
      { headers: { upgrade: "websocket" } }
    ));
    const client = response.webSocket;
    if (client === null) throw new Error("expected socket");
    client.accept();
    await nextMessage(client);
    const storage = rooms.state("socket-error-expiry").storage;
    const expired = refreshRoomActivity(
      (await new RoomStore(storage).load(now))!,
      now - DAY_MS - 1_000
    );
    await storage.put(ROOM_RECORD_KEY, expired);
    await rooms.alarm("socket-error-expiry");

    await rooms.errorServerSockets("socket-error-expiry");

    expect((storage as unknown as MemoryStorage).alarm).toBeLessThanOrEqual(Date.now());
    closeSocket(client);
  });

  it("broadcasts the terminal expiry error and closes a socket that races with cleanup", async () => {
    const storage = new MemoryStorage();
    await new RoomStore(storage).save(roomWithSeats(1, Date.now() - DAY_MS - 1_000));
    const sent: string[] = [];
    const closed: Array<{ code?: number; reason?: string }> = [];
    const racingSocket = {
      readyState: WebSocket.OPEN,
      send: (message: string) => sent.push(message),
      close: (code?: number, reason?: string) => closed.push({ code, reason })
    } as unknown as WebSocket;
    let socketReads = 0;
    const state = {
      storage,
      getWebSockets: () => socketReads++ === 0 ? [] : [racingSocket]
    } as unknown as DurableObjectState;
    const room = new RoomDurableObject(state, {} as Env);

    await room.alarm();

    expect(sent.map((message) => JSON.parse(message))).toEqual([{
      type: "room.expired",
      error: { code: "ROOM_EXPIRED", params: {}, retryable: false }
    }]);
    expect(closed).toEqual([{ code: 4002, reason: "ROOM_EXPIRED" }]);
  });

  it("isolates terminal send and close failures per socket", async () => {
    const storage = new MemoryStorage();
    await new RoomStore(storage).save(roomWithSeats(1, Date.now() - DAY_MS - 1_000));
    const delivered: string[] = [];
    const closed: number[] = [];
    const failing = {
      readyState: WebSocket.OPEN,
      send: () => { throw new Error("send failed"); },
      close: () => { throw new Error("close failed"); }
    } as unknown as WebSocket;
    const healthy = {
      readyState: WebSocket.OPEN,
      send: (message: string) => delivered.push(message),
      close: (code?: number) => { if (code !== undefined) closed.push(code); }
    } as unknown as WebSocket;
    let socketReads = 0;
    const state = {
      storage,
      getWebSockets: () => socketReads++ === 0 ? [] : [failing, healthy]
    } as unknown as DurableObjectState;

    await expect(new RoomDurableObject(state, {} as Env).alarm()).resolves.toBeUndefined();

    expect(delivered.map((message) => JSON.parse(message))).toEqual([{
      type: "room.expired",
      error: { code: "ROOM_EXPIRED", params: {}, retryable: false }
    }]);
    expect(closed).toEqual([4002]);
  });
});
