import { RuleViolationError } from "../domain/errors";
import { applyMatchCommand } from "../domain/match/applyMatchCommand";
import {
  createUiState,
  localMatchExecutionContext,
  type AppState,
  type GameCommand
} from "./localGameState";

export { createInitialAppState } from "./localGameState";
export type { AppState, GameCommand, UiCommand, UiState } from "./localGameState";

export function gameReducer(state: AppState, command: GameCommand): AppState {
  try {
    if (command.type === "SELECT_DICE_TOTAL") {
      return { ...state, selectedDiceTotal: command.diceTotal, notice: null };
    }
    if (command.type === "SELECT_PLAYER") {
      return { ...state, selectedPlayerId: command.playerId, notice: null };
    }

    const matchState = applyMatchCommand(state, command, localMatchExecutionContext);
    if (command.type === "START_NEW_GAME") {
      return { ...matchState, ...createUiState(matchState.game.activePlayerId) };
    }
    return { ...state, ...matchState, notice: null };
  } catch (error) {
    if (!(error instanceof RuleViolationError)) {
      throw error;
    }
    return {
      ...state,
      notice: error.message
    };
  }
}
