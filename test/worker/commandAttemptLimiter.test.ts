import { describe, expect, it } from "vitest";

import { createCommandAttemptLimiter } from "../../worker/room/commandAttemptLimiter";

describe("command attempt limiter", () => {
  it("stops counting a successful attempt in memory after it is persisted", () => {
    const limiter = createCommandAttemptLimiter({ maximum: 2, windowMs: 2_000 });
    const input = { roomCode: "ABC234", currentSeatIds: ["seat-1"], seatId: "seat-1" };
    expect(limiter.assess({ ...input, persistedAttemptTimestamps: [], now: 100, recordAttempt: true }).limited).toBe(false);
    limiter.markPersisted(input.roomCode, input.seatId, 100);
    expect(limiter.assess({ ...input, persistedAttemptTimestamps: [100], now: 101, recordAttempt: true }).limited).toBe(false);
    expect(limiter.assess({ ...input, persistedAttemptTimestamps: [100], now: 102, recordAttempt: true }).limited).toBe(true);
  });

  it("prunes restart attempts exactly at the rate window boundary", () => {
    const limiter = createCommandAttemptLimiter({ maximum: 1, windowMs: 2_000 });
    const input = {
      roomCode: "ABC234",
      currentSeatIds: ["seat-1"],
      seatId: "seat-1",
      persistedAttemptTimestamps: []
    };

    expect(limiter.assess({
      ...input,
      now: 100,
      recordAttempt: true
    })).toEqual({ limited: false, recentPersistedAttemptTimestamps: [] });
    expect(limiter.assess({
      ...input,
      now: 2_099,
      recordAttempt: false
    }).limited).toBe(true);
    expect(limiter.assess({
      ...input,
      now: 2_100,
      recordAttempt: false
    }).limited).toBe(false);
    expect(limiter.snapshot()).toEqual({ roomCode: "ABC234", trackedSeatIds: [] });
  });

  it("drops departed-seat and old-room keys while staying within the current seat bound", () => {
    const limiter = createCommandAttemptLimiter({ maximum: 3, windowMs: 2_000 });

    limiter.assess({
      roomCode: "ABC234",
      currentSeatIds: ["seat-1", "seat-2"],
      seatId: "seat-1",
      persistedAttemptTimestamps: [],
      now: 100,
      recordAttempt: true
    });
    limiter.assess({
      roomCode: "ABC234",
      currentSeatIds: ["seat-1", "seat-2"],
      seatId: "seat-2",
      persistedAttemptTimestamps: [],
      now: 101,
      recordAttempt: true
    });
    expect(limiter.snapshot()).toEqual({
      roomCode: "ABC234",
      trackedSeatIds: ["seat-1", "seat-2"]
    });

    limiter.assess({
      roomCode: "ABC234",
      currentSeatIds: ["seat-2"],
      seatId: "seat-2",
      persistedAttemptTimestamps: [],
      now: 102,
      recordAttempt: false
    });
    expect(limiter.snapshot()).toEqual({ roomCode: "ABC234", trackedSeatIds: ["seat-2"] });

    limiter.assess({
      roomCode: "XYZ789",
      currentSeatIds: ["seat-9"],
      seatId: "seat-9",
      persistedAttemptTimestamps: [],
      now: 103,
      recordAttempt: true
    });
    const recreatedRoom = limiter.snapshot();
    expect(recreatedRoom).toEqual({ roomCode: "XYZ789", trackedSeatIds: ["seat-9"] });
    expect(recreatedRoom.trackedSeatIds).toHaveLength(1);
  });
});
