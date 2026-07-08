import { collectProduction } from "../rules/production";
import {
  addResourceMaps,
  emptyResources,
  resources,
  scaleResources,
  type GameState,
  type PlayerId,
  type ResourceMap
} from "../types";

export interface PlayerIncomeRow {
  diceTotal: number;
  probability: number;
  resources: ResourceMap;
  expected: ResourceMap;
}

export interface DiceIncome {
  diceTotal: number;
  probability: number;
  players: Record<PlayerId, ResourceMap>;
}

export interface ExpectedIncomeMatrix {
  rows: DiceIncome[];
  totals: Record<PlayerId, ResourceMap>;
}

const diceTotals = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const diceWays: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1
};

export function diceProbability(diceTotal: number): number {
  return (diceWays[diceTotal] ?? 0) / 36;
}

export function getPlayerIncome(game: GameState, playerId: PlayerId): PlayerIncomeRow[] {
  return diceTotals.map((diceTotal) => {
    const resourcesForRoll = collectProduction(game, diceTotal).byPlayer[playerId] ?? emptyResources();
    const probability = diceProbability(diceTotal);

    return {
      diceTotal,
      probability,
      resources: resourcesForRoll,
      expected: scaleResources(resourcesForRoll, probability)
    };
  });
}

export function getDiceIncome(game: GameState, diceTotal: number): DiceIncome {
  return {
    diceTotal,
    probability: diceProbability(diceTotal),
    players: collectProduction(game, diceTotal).byPlayer
  };
}

export function getExpectedIncomeMatrix(game: GameState): ExpectedIncomeMatrix {
  const rows = diceTotals.map((diceTotal) => getDiceIncome(game, diceTotal));
  const totals = Object.fromEntries(
    game.players.map((player) => [player.id, emptyResources()])
  ) as Record<PlayerId, ResourceMap>;

  for (const row of rows) {
    for (const player of game.players) {
      totals[player.id] = addResourceMaps(
        totals[player.id],
        scaleResources(row.players[player.id], row.probability)
      );
    }
  }

  for (const playerId of Object.keys(totals)) {
    for (const resource of resources) {
      if (Object.is(totals[playerId][resource], -0)) {
        totals[playerId][resource] = 0;
      }
    }
  }

  return { rows, totals };
}

