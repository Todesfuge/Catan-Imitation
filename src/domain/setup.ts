import {
  createSetupMatch,
  defaultMatchSeats
} from "./match/createMatch";
import { LEGACY_STANDARD_MAP_SEED } from "./mapSeed";
import { DeterministicRandomSource } from "./match/random";
import type { GameState } from "./types";

export { defaultMatchSeats } from "./match/createMatch";

export function createSetupGame(): GameState {
  if (arguments.length > 0) {
    throw new RangeError("createSetupGame does not accept arguments; use createSetupMatch.");
  }

  return createSetupMatch(
    defaultMatchSeats,
    { kind: "seed", seed: LEGACY_STANDARD_MAP_SEED },
    {
      random: new DeterministicRandomSource(
        Array.from({ length: 24 }, (_, index) => 24 - index)
      ),
      nextMapSeed: () => LEGACY_STANDARD_MAP_SEED,
      nextLogId: () => "unused-setup-log",
      now: () => 0
    }
  ).game;
}
