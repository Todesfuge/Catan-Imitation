interface RateLimitPolicy {
  maximum: number;
  windowMs: number;
}

interface AttemptAssessment {
  roomCode: string;
  currentSeatIds: readonly string[];
  seatId: string;
  persistedAttemptTimestamps: readonly number[];
  now: number;
  recordAttempt: boolean;
}

export function createCommandAttemptLimiter(rateLimit: RateLimitPolicy) {
  let trackedRoomCode: string | undefined;
  const unpersistedAttemptsBySeatId = new Map<string, number[]>();

  function synchronize(roomCode: string, currentSeatIds: readonly string[], now: number): Set<string> {
    if (trackedRoomCode !== roomCode) {
      unpersistedAttemptsBySeatId.clear();
      trackedRoomCode = roomCode;
    }

    const currentSeats = new Set(currentSeatIds);
    for (const [seatId, timestamps] of unpersistedAttemptsBySeatId) {
      const recent = timestamps.filter((timestamp) => timestamp > now - rateLimit.windowMs);
      if (!currentSeats.has(seatId) || recent.length === 0) {
        unpersistedAttemptsBySeatId.delete(seatId);
      } else {
        unpersistedAttemptsBySeatId.set(seatId, recent.slice(-rateLimit.maximum));
      }
    }
    return currentSeats;
  }

  return {
    assess(input: AttemptAssessment) {
      const currentSeats = synchronize(input.roomCode, input.currentSeatIds, input.now);
      const recentPersistedAttemptTimestamps = input.persistedAttemptTimestamps
        .filter((timestamp) => timestamp > input.now - rateLimit.windowMs);
      const recentUnpersistedAttempts = unpersistedAttemptsBySeatId.get(input.seatId) ?? [];
      const limited = recentPersistedAttemptTimestamps.length + recentUnpersistedAttempts.length
        >= rateLimit.maximum;

      if (!limited && input.recordAttempt && currentSeats.has(input.seatId)) {
        unpersistedAttemptsBySeatId.set(
          input.seatId,
          [...recentUnpersistedAttempts, input.now].slice(-rateLimit.maximum)
        );
      }

      return { limited, recentPersistedAttemptTimestamps };
    },

    markPersisted(roomCode: string, seatId: string, now: number): void {
      if (roomCode !== trackedRoomCode) return;
      const attempts = unpersistedAttemptsBySeatId.get(seatId);
      const index = attempts?.indexOf(now) ?? -1;
      if (!attempts || index < 0) return;
      attempts.splice(index, 1);
      if (attempts.length === 0) unpersistedAttemptsBySeatId.delete(seatId);
    },

    snapshot() {
      return {
        roomCode: trackedRoomCode,
        trackedSeatIds: [...unpersistedAttemptsBySeatId.keys()].sort()
      };
    }
  };
}
