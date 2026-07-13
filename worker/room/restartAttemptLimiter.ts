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
  recordRestartAttempt: boolean;
}

export function createRestartAttemptLimiter(rateLimit: RateLimitPolicy) {
  let trackedRoomCode: string | undefined;
  const restartAttemptsBySeatId = new Map<string, number[]>();

  function synchronize(roomCode: string, currentSeatIds: readonly string[], now: number): Set<string> {
    if (trackedRoomCode !== roomCode) {
      restartAttemptsBySeatId.clear();
      trackedRoomCode = roomCode;
    }

    const currentSeats = new Set(currentSeatIds);
    for (const [seatId, timestamps] of restartAttemptsBySeatId) {
      const recent = timestamps.filter((timestamp) => timestamp > now - rateLimit.windowMs);
      if (!currentSeats.has(seatId) || recent.length === 0) {
        restartAttemptsBySeatId.delete(seatId);
      } else {
        restartAttemptsBySeatId.set(seatId, recent.slice(-rateLimit.maximum));
      }
    }
    return currentSeats;
  }

  return {
    assess(input: AttemptAssessment) {
      const currentSeats = synchronize(input.roomCode, input.currentSeatIds, input.now);
      const recentPersistedAttemptTimestamps = input.persistedAttemptTimestamps
        .filter((timestamp) => timestamp > input.now - rateLimit.windowMs);
      const recentRestartAttempts = restartAttemptsBySeatId.get(input.seatId) ?? [];
      const limited = recentPersistedAttemptTimestamps.length + recentRestartAttempts.length
        >= rateLimit.maximum;

      if (!limited && input.recordRestartAttempt && currentSeats.has(input.seatId)) {
        restartAttemptsBySeatId.set(
          input.seatId,
          [...recentRestartAttempts, input.now].slice(-rateLimit.maximum)
        );
      }

      return { limited, recentPersistedAttemptTimestamps };
    },

    snapshot() {
      return {
        roomCode: trackedRoomCode,
        trackedSeatIds: [...restartAttemptsBySeatId.keys()].sort()
      };
    }
  };
}
