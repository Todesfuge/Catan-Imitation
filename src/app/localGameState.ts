import { createCommerceGuild } from "../domain/expansion/commerceGuild";
import { getActionAvailability, getActionAvailabilityFacts } from "./actionAvailability";
import type { MatchExecutionContext, MatchState } from "../domain/match/types";
import type { RandomSource } from "../domain/match/random";
import { calculatePlayerScore } from "../domain/rules/scoring";
import {
  getPlayerTradeAcceptanceReason,
  getPlayerTradePublishReason
} from "../domain/rules/playerTrade";
import { createDemoGame, defaultMatchSeats } from "../domain/setup";
import {
  getDiceIncome,
  getExpectedIncomeMatrix,
  getPlayerIncome
} from "../domain/stats/income";
import type { PlayerId } from "../domain/types";
import type {
  GameTableCommand,
  GameTableUiCommand,
  GameTableView
} from "../ui/GameTable";

export interface UiState {
  selectedDiceTotal: number;
  selectedPlayerId: PlayerId;
  notice: string | null;
}

export interface AppState extends MatchState, UiState {}

export type UiCommand = GameTableUiCommand;

export type GameCommand = GameTableCommand;

class LocalRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer.");
    }
    return Math.floor(Math.random() * maxExclusive);
  }
}

let logCounter = 0;

export const localMatchSeats = defaultMatchSeats;

export const localMatchExecutionContext: MatchExecutionContext = {
  random: new LocalRandomSource(),
  nextLogId: () => `log-${++logCounter}`,
  now: () => Date.now()
};

export function createUiState(selectedPlayerId: PlayerId): UiState {
  return {
    selectedDiceTotal: 8,
    selectedPlayerId,
    notice: null
  };
}

export function createInitialAppState(): AppState {
  const game = createDemoGame();
  return {
    game,
    guild: createCommerceGuild(),
    lastDice: null,
    ...createUiState(game.activePlayerId)
  };
}

export function createLocalGameTableView(state: AppState): GameTableView {
  const { players, developmentDeck, ...publicGame } = state.game;
  const activePlayerId = state.game.activePlayerId;
  const actionFacts = getActionAvailabilityFacts(state, activePlayerId);
  return {
    game: {
      ...publicGame,
      players: players.map((player) => ({
        ...player,
        visibleScore: calculatePlayerScore(state.game, player.id),
        resourceCardCount: Object.values(player.resources).reduce(
          (total, count) => total + count,
          0
        ),
        developmentCardCount: player.developmentCards.length
      })),
      developmentDeckCount: developmentDeck.length
    },
    guild: state.guild,
    lastDice: state.lastDice,
    ...(state.pendingPlayerTrade ? { pendingPlayerTrade: state.pendingPlayerTrade } : {}),
    selectedDiceTotal: state.selectedDiceTotal,
    selectedPlayerId: state.selectedPlayerId,
    notice: state.notice,
    statistics: {
      playerRows: Object.fromEntries(
        players.map((player) => [player.id, getPlayerIncome(state.game, player.id)])
      ),
      diceIncome: Object.fromEntries(
        [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((total) => [
          total,
          getDiceIncome(state.game, total)
        ])
      ),
      matrix: getExpectedIncomeMatrix(state.game)
    },
    legality: {
      actions: getActionAvailability(state, activePlayerId),
      setupRoadEdgeIds: actionFacts.setup.road.targets,
      setupSettlementVertexIds: actionFacts.setup.settlement.targets,
      freeRoadEdgeIds: actionFacts.decisions.freeRoad.targets
    },
    tradePolicy: {
      publishReason: (offered, requested) =>
        getPlayerTradePublishReason(state.game, activePlayerId, offered, requested),
      acceptanceReasons: Object.fromEntries(
        players.map((player) => [
          player.id,
          state.pendingPlayerTrade
            ? getPlayerTradeAcceptanceReason(state.game, state.pendingPlayerTrade, player.id)
            : null
        ])
      )
    }
  };
}
