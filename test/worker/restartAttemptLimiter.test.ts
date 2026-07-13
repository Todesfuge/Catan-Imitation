import { describe, expect, it } from "vitest";

import { createRestartAttemptLimiter } from "../../worker/room/restartAttemptLimiter";

describe("restart attempt limiter", () => {
  it("prunes restart attempts exactly at the rate window boundary", () => {
    const limiter = createRestartAttemptLimiter({ maximum: 1, windowMs: 2_000 });
    const input = {
      roomCode: "ABC234",
      currentSeatIds: ["seat-1"],
      seatId: "seat-1",
      persistedAttemptTimestamps: []
    };

    expect(limiter.assess({
      ...input,
      now: 100,
      recordRestartAttempt: true
    })).toEqual({ limited: false, recentPersistedAttemptTimestamps: [] });
    expect(limiter.assess({
      ...input,
      now: 2_099,
      recordRestartAttempt: false
    }).limited).toBe(true);
    expect(limiter.assess({
      ...input,
      now: 2_100,
      recordRestartAttempt: false
    }).limited).toBe(false);
    expect(limiter.snapshot()).toEqual({ roomCode: "ABC234", trackedSeatIds: [] });
  });

  it("drops departed-seat and old-room keys while staying within the current seat bound", () => {
    const limiter = createRestartAttemptLimiter({ maximum: 3, windowMs: 2_000 });

    limiter.assess({
      roomCode: "ABC234",
      currentSeatIds: ["seat-1", "seat-2"],
      seatId: "seat-1",
      persistedAttemptTimestamps: [],
      now: 100,
      recordRestartAttempt: true
    });
    limiter.assess({
      roomCode: "ABC234",
      currentSeatIds: ["seat-1", "seat-2"],
      seatId: "seat-2",
      persistedAttemptTimestamps: [],
      now: 101,
      recordRestartAttempt: true
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
      recordRestartAttempt: false
    });
    expect(limiter.snapshot()).toEqual({ roomCode: "ABC234", trackedSeatIds: ["seat-2"] });

    limiter.assess({
      roomCode: "XYZ789",
      currentSeatIds: ["seat-9"],
      seatId: "seat-9",
      persistedAttemptTimestamps: [],
      now: 103,
      recordRestartAttempt: true
    });
    const recreatedRoom = limiter.snapshot();
    expect(recreatedRoom).toEqual({ roomCode: "XYZ789", trackedSeatIds: ["seat-9"] });
    expect(recreatedRoom.trackedSeatIds).toHaveLength(1);
  });
});
