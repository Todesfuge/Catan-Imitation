import type { MatchExecutionContext } from "../../src/domain/match/types";

const DICE_TOTALS = [4, 5, 6, 8, 9, 10, 11, 3, 12, 2, 7] as const;
const UINT32_RANGE = 0x1_0000_0000;
const ZERO_BASED_DICE: Record<(typeof DICE_TOTALS)[number], readonly [number, number]> = {
  4: [1, 1],
  5: [1, 2],
  6: [2, 2],
  7: [2, 3],
  8: [3, 3],
  9: [3, 4],
  2: [0, 0],
  3: [0, 1],
  10: [4, 4],
  11: [4, 5],
  12: [5, 5]
};

/**
 * Local E2E-only authoritative randomness. Values depend solely on the stored
 * room version, so retries replay and no browser can select an outcome.
 */
export function prepareE2EExecutionContext(now: number) {
  return (roomVersion: number): MatchExecutionContext => {
    const dice = ZERO_BASED_DICE[DICE_TOTALS[roomVersion % DICE_TOTALS.length]];
    let sixSidedDraw = 0;
    let generalDraw = 0;
    return {
      random: {
        nextInt(maxExclusive) {
          if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
            throw new RangeError("maxExclusive must be positive");
          }
          if (maxExclusive === 6 && sixSidedDraw < 2) return dice[sixSidedDraw++];
          // Blind-box outcome draws use the unit-interval adapter. Force its
          // development-card branch without accepting any client input.
          if (maxExclusive === UINT32_RANGE) return 0xe6666666;
          return (roomVersion + generalDraw++) % maxExclusive;
        }
      },
      nextLogId: () => crypto.randomUUID(),
      now: () => now
    };
  };
}
