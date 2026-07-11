import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import type { MatchExecutionContext } from "../../src/domain/match/types";
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

class MemoryStorage implements RoomStorage {
  readonly values = new Map<string, unknown>();
  readonly alarms: number[] = [];

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
    this.alarms.push(
      scheduledTime instanceof Date ? scheduledTime.getTime() : scheduledTime
    );
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
      schemaVersion: 1,
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
      acceptedCommandIds: []
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
    const room = roomWithSeats(4);
    const result = leaveLobby(room, "seat-1", ["seat-4", "seat-3"], 8_000);

    expect(result.kind).toBe("updated");
    if (result.kind !== "updated") throw new Error("expected updated room");
    expect(result.room.seats.map((seat) => seat.seatId)).toEqual([
      "seat-2",
      "seat-3",
      "seat-4"
    ]);
    expect(result.room.hostSeatId).toBe("seat-3");
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
      { ...roomWithSeats(), schemaVersion: 2 },
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
      }
    ]) {
      const storage = new MemoryStorage();
      storage.values.set(ROOM_RECORD_KEY, invalid);
      await expect(new RoomStore(storage).load(1_000)).rejects.toBeInstanceOf(
        RoomSchemaError
      );
    }
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

  it("integrates with real Durable Object storage and alarm scheduling", async () => {
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
  });
});
