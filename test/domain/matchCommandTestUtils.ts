import { applyMatchCommand } from "../../src/domain/match/applyMatchCommand";
import { formatM1MapSeed } from "../../src/domain/mapSeed";
import { DeterministicRandomSource } from "../../src/domain/match/random";
import type {
  MatchCommand,
  MatchExecutionContext,
  MatchState
} from "../../src/domain/match/types";

type RollCommand = Extract<MatchCommand, { type: "ROLL_DICE" }> & {
  dice: [number, number];
};

type RobberCommand = Extract<MatchCommand, { type: "STEAL_ROBBER_RESOURCE" }> & {
  random: () => number;
};

export type TestMatchCommand =
  | Exclude<MatchCommand, { type: "ROLL_DICE" | "STEAL_ROBBER_RESOURCE" }>
  | RollCommand
  | RobberCommand;

let logCounter = 0;
const testMapSeed = formatM1MapSeed(0x0123_4567, 0x89ab_cdef);

export function executeMatchCommandForTest<T extends MatchState>(
  state: T,
  command: TestMatchCommand
): T {
  const randomValues =
    command.type === "ROLL_DICE"
      ? command.dice.map((die) => die - 1)
      : command.type === "STEAL_ROBBER_RESOURCE"
        ? [Math.floor(command.random() * 0x1_0000_0000)]
        : [];
  const context: MatchExecutionContext = {
    random: new DeterministicRandomSource(randomValues),
    nextMapSeed: () => testMapSeed,
    nextLogId: () => `test-log-${++logCounter}`,
    now: () => 1_700_000_000_000
  };
  const { dice: _dice, random: _random, ...matchCommand } = command as TestMatchCommand & {
    dice?: [number, number];
    random?: () => number;
  };
  return {
    ...state,
    ...applyMatchCommand(state, matchCommand as MatchCommand, context)
  };
}
