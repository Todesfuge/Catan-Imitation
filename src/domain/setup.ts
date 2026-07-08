import { createStandardBoardData } from "./board";
import { createDevelopmentDeck } from "./rules/developmentCards";
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

function createPlayers(): Player[] {
  return [
    createPlayer("p1", "Voyage1969", "#f2f2f2"),
    createPlayer("p2", "Loss", "#ef4444"),
    createPlayer("p3", "Kay", "#f97316"),
    createPlayer("p4", "Amias", "#2563eb")
  ];
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
  const { board, edges } = createStandardBoardData();
  const pastureEight = getHex(board, "pasture-8");
  const mountainEight = getHex(board, "mountain-8");
  const p1VertexId = pastureEight.vertexIds[0];
  const p2VertexId = mountainEight.vertexIds[0];
  const p1RoadEdge = getEdgeTouchingVertex(edges, p1VertexId);
  const p2RoadEdge = getEdgeTouchingVertex(edges, p2VertexId);

  return {
    phase: "playing",
    players: createPlayers(),
    activePlayerId: "p1",
    turn: 1,
    round: 1,
    targetScore: 10,
    board,
    edges,
    ports: [],
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
        message: "Welcome to Catan Imitation."
      }
    ]
  };
}

export function createSetupGame(): GameState {
  const { board, edges } = createStandardBoardData();

  return {
    phase: "setup",
    players: createPlayers(),
    activePlayerId: "p1",
    turn: 1,
    round: 1,
    targetScore: 10,
    board,
    edges,
    ports: [],
    buildings: [],
    roads: [],
    robberHexId: "desert",
    bank: createBank(),
    developmentDeck: createDevelopmentDeck(),
    setup: {
      order: ["p1", "p2", "p3", "p4", "p4", "p3", "p2", "p1"],
      placementIndex: 0,
      stage: "settlement"
    },
    log: [
      {
        id: "log-setup",
        message: "Setup started. Place settlements and roads in snake order."
      }
    ]
  };
}
