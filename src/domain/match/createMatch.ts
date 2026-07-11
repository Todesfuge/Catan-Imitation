import { createCommerceGuild } from "../expansion/commerceGuild";
import { createStandardBoardData } from "../board";
import { createDevelopmentDeck } from "../rules/developmentCards";
import { createAwaitingRollTurnState } from "../rules/turnFlow";
import {
  emptyResources,
  type BoardEdge,
  type BoardHex,
  type GameState,
  type Player
} from "../types";
import type { MatchExecutionContext, MatchState } from "./types";

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

function getHex(board: BoardHex[], hexId: string): BoardHex {
  const hex = board.find((candidate) => candidate.id === hexId);
  if (!hex) {
    throw new Error(`Unknown setup hex: ${hexId}`);
  }
  return hex;
}

function getEdgeTouchingVertex(edges: BoardEdge[], vertexId: string): BoardEdge {
  const edge = edges.find((candidate) => candidate.vertexIds.includes(vertexId));
  if (!edge) {
    throw new Error(`Unknown setup edge for vertex: ${vertexId}`);
  }
  return edge;
}

export function createDemoGame(): GameState {
  const { board, edges, ports } = createStandardBoardData();
  const pastureEight = getHex(board, "pasture-8");
  const mountainEight = getHex(board, "mountain-8");
  const p1VertexId = pastureEight.vertexIds[0];
  const p2VertexId = mountainEight.vertexIds[0];
  const p1RoadEdge = getEdgeTouchingVertex(edges, p1VertexId);
  const p2RoadEdge = getEdgeTouchingVertex(edges, p2VertexId);

  return {
    phase: "playing",
    players: createPlayers(defaultMatchSeats),
    activePlayerId: "p1",
    turn: 1,
    round: 1,
    turnState: createAwaitingRollTurnState(),
    targetScore: 10,
    board,
    edges,
    ports,
    buildings: [
      {
        id: "b-p1-city-pasture-8",
        ownerId: "p1",
        vertexId: p1VertexId,
        kind: "city"
      },
      {
        id: "b-p2-settlement-mountain-8",
        ownerId: "p2",
        vertexId: p2VertexId,
        kind: "settlement"
      }
    ],
    roads: [
      {
        id: `demo-road-p1-${p1RoadEdge.id}`,
        ownerId: "p1",
        edgeId: p1RoadEdge.id
      },
      {
        id: `demo-road-p2-${p2RoadEdge.id}`,
        ownerId: "p2",
        edgeId: p2RoadEdge.id
      }
    ],
    robberHexId: "desert",
    bank: createBank(),
    developmentDeck: createDevelopmentDeck(),
    log: [
      {
        id: "log-welcome",
        message: "Welcome to Catan Imitation.",
        messageKey: "game.welcome"
      }
    ]
  };
}

function createSetupGameState(
  seats: readonly MatchSeat[],
  developmentDeck: GameState["developmentDeck"]
): GameState {
  const { board, edges, ports } = createStandardBoardData();
  const playerIds = seats.map((_, index) => `p${index + 1}`);

  return {
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
    robberHexId: "desert",
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
  context: MatchExecutionContext
): MatchState {
  if (seats.length !== 3 && seats.length !== 4) {
    throw new RangeError("A match requires three or four seats.");
  }

  return {
    game: createSetupGameState(seats, shuffleDevelopmentDeck(context)),
    guild: createCommerceGuild(),
    lastDice: null
  };
}
