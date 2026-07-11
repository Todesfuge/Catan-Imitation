import { createStandardBoardData } from "./board";
import { createDevelopmentDeck } from "./rules/developmentCards";
import { createAwaitingRollTurnState } from "./rules/turnFlow";
import { emptyResources, type BoardEdge, type BoardHex, type GameState, type Player } from "./types";

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

const defaultPlayerNames = ["Voyage1969", "Loss", "Kay", "Amias"];
const playerColors = ["#f2f2f2", "#ef4444", "#f97316", "#2563eb"];

function createPlayers(playerNames: readonly string[] = defaultPlayerNames): Player[] {
  return playerNames.map((name, index) =>
    createPlayer(`p${index + 1}`, name, playerColors[index])
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

export function createDemoGame(playerNames: readonly string[] = defaultPlayerNames): GameState {
  const { board, edges, ports } = createStandardBoardData();
  const pastureEight = getHex(board, "pasture-8");
  const mountainEight = getHex(board, "mountain-8");
  const p1VertexId = pastureEight.vertexIds[0];
  const p2VertexId = mountainEight.vertexIds[0];
  const p1RoadEdge = getEdgeTouchingVertex(edges, p1VertexId);
  const p2RoadEdge = getEdgeTouchingVertex(edges, p2VertexId);

  return {
    phase: "playing",
    players: createPlayers(playerNames),
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

export function createSetupGame(
  playerNames: readonly string[] = defaultPlayerNames,
  developmentDeck = createDevelopmentDeck()
): GameState {
  const { board, edges, ports } = createStandardBoardData();
  const playerIds = playerNames.map((_, index) => `p${index + 1}`);

  return {
    phase: "setup",
    players: createPlayers(playerNames),
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
