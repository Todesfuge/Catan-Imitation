import {
  createSetupMatch,
  defaultMatchSeats
} from "./match/createMatch";
import { DeterministicRandomSource } from "./match/random";
import type { GameState } from "./types";

export { createDemoGame, defaultMatchSeats } from "./match/createMatch";

export function createSetupGame(): GameState {
  if (arguments.length > 0) {
    throw new RangeError("createSetupGame does not accept arguments; use createSetupMatch.");
  }

  return createSetupMatch(defaultMatchSeats, {
    random: new DeterministicRandomSource(
      Array.from({ length: 24 }, (_, index) => 24 - index)
    ),
    nextLogId: () => "unused-setup-log",
    now: () => 0
  }).game;
}
