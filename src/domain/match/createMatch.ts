import { createCommerceGuild } from "../expansion/commerceGuild";
import {
  LEGACY_STANDARD_MAP_SEED,
  parseMapSeed,
  type MapSeed
} from "../mapSeed";
import { createBoardDataForSeed } from "../randomBoard";
import { createDevelopmentDeck } from "../rules/developmentCards";
import { createAwaitingRollTurnState } from "../rules/turnFlow";
import {
  emptyResources,
  type GameState,
  type Player
} from "../types";
import type {
  MatchExecutionContext,
  MatchMapSelection,
  MatchState
} from "./types";

export interface MatchSeat {
  nickname: string;
}

export const defaultMatchSeats: readonly MatchSeat[] = [
  { nickname: "Voyage1969" },
  { nickname: "Loss" },
  { nickname: "Kay" },
  { nickname: "Amias" }
];

const matchPlayerColors = ["#f2f2f2", "#ef4444", "#f97316", "#2563eb"] as const;

function createPlayer(id: string, name: string, color: string): Player {
  return {
    id,
    name,
    color,
    resources: emptyResources(),
    guildTokens: 0,
    vouchers: 0,
    prizeCards: 0,
    developmentCards: [],
    knightsPlayed: 0
  };
}

function createPlayers(seats: readonly MatchSeat[]): Player[] {
  return seats.map((seat, index) =>
    createPlayer(`p${index + 1}`, seat.nickname, matchPlayerColors[index])
  );
}

function createBank() {
  return {
    resources: {
      wood: 19,
      brick: 19,
      wool: 19,
      grain: 19,
      ore: 19
    }
  };
}

function createSetupGameState(
  seats: readonly MatchSeat[],
  mapSeed: MapSeed,
  developmentDeck: GameState["developmentDeck"]
): GameState {
  const { board, edges, ports } = createBoardDataForSeed(mapSeed);
  const playerIds = seats.map((_, index) => `p${index + 1}`);
  const robberHexId = board.find((hex) => hex.terrain === "desert")?.id;
  if (!robberHexId) {
    throw new Error("A setup board requires exactly one robber starting hex.");
  }

  return {
    mapSeed,
    phase: "setup",
    players: createPlayers(seats),
    activePlayerId: "p1",
    turn: 1,
    round: 1,
    turnState: createAwaitingRollTurnState(),
    targetScore: 10,
    board,
    edges,
    ports,
    buildings: [],
    roads: [],
    robberHexId,
    bank: createBank(),
    developmentDeck,
    setup: {
      order: [...playerIds, ...playerIds.slice().reverse()],
      placementIndex: 0,
      stage: "settlement"
    },
    log: [
      {
        id: "log-setup",
        message: "Setup started. Place settlements and roads in snake order.",
        messageKey: "setup.started"
      }
    ]
  };
}

function shuffleDevelopmentDeck(context: MatchExecutionContext) {
  const deck = createDevelopmentDeck();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = context.random.nextInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function createSetupMatch(
  seats: readonly MatchSeat[],
  map: MatchMapSelection,
  context: MatchExecutionContext
): MatchState {
  if (seats.length !== 3 && seats.length !== 4) {
    throw new RangeError("A match requires three or four seats.");
  }
  const mapSeed = parseMapSeed(
    map.kind === "fresh" ? context.nextMapSeed() : map.seed
  );
  if (map.kind === "fresh" && mapSeed === LEGACY_STANDARD_MAP_SEED) {
    throw new TypeError("A fresh setup requires an M1 map seed.");
  }

  const game = createSetupGameState(seats, mapSeed, shuffleDevelopmentDeck(context));
  return {
    game,
    guild: createCommerceGuild(game.players.length, game.turn),
    lastDice: null
  };
}
