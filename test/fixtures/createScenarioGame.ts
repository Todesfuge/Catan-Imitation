import { createStandardBoardData } from "../../src/domain/board";
import type { AppState } from "../../src/app/localGameState";
import { createCommerceGuild } from "../../src/domain/expansion/commerceGuild";
import { LEGACY_STANDARD_MAP_SEED } from "../../src/domain/mapSeed";
import { defaultMatchSeats } from "../../src/domain/match/createMatch";
import { createDevelopmentDeck } from "../../src/domain/rules/developmentCards";
import { createAwaitingRollTurnState } from "../../src/domain/rules/turnFlow";
import {
  emptyResources,
  type BoardEdge,
  type BoardHex,
  type GameState,
  type Player
} from "../../src/domain/types";

const scenarioPlayerColors = ["#f2f2f2", "#ef4444", "#f97316", "#2563eb"] as const;

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

function getHex(board: BoardHex[], hexId: string): BoardHex {
  const hex = board.find((candidate) => candidate.id === hexId);
  if (!hex) throw new Error(`Unknown scenario hex: ${hexId}`);
  return hex;
}

function getEdgeTouchingVertex(edges: BoardEdge[], vertexId: string): BoardEdge {
  const edge = edges.find((candidate) => candidate.vertexIds.includes(vertexId));
  if (!edge) throw new Error(`Unknown scenario edge for vertex: ${vertexId}`);
  return edge;
}

export function createScenarioGame(): GameState {
  const { board, edges, ports } = createStandardBoardData();
  const pastureEight = getHex(board, "pasture-8");
  const mountainEight = getHex(board, "mountain-8");
  const p1VertexId = pastureEight.vertexIds[0];
  const p2VertexId = mountainEight.vertexIds[0];
  const p1RoadEdge = getEdgeTouchingVertex(edges, p1VertexId);
  const p2RoadEdge = getEdgeTouchingVertex(edges, p2VertexId);

  return {
    mapSeed: LEGACY_STANDARD_MAP_SEED,
    phase: "playing",
    players: defaultMatchSeats.map((seat, index) =>
      createPlayer(`p${index + 1}`, seat.nickname, scenarioPlayerColors[index]!)
    ),
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
    bank: {
      resources: {
        wood: 19,
        brick: 19,
        wool: 19,
        grain: 19,
        ore: 19
      }
    },
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

export function createScenarioAppState(): AppState {
  const game = createScenarioGame();
  return {
    game,
    guild: createCommerceGuild(game.players.length, game.turn),
    lastDice: null,
    selectedDiceTotal: 8,
    selectedPlayerId: game.activePlayerId,
    notice: null
  };
}
