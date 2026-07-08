import { createStandardBoardData } from "./board";
import { emptyResources, type GameState, type Player } from "./types";

function createPlayer(id: string, name: string, color: string): Player {
  return {
    id,
    name,
    color,
    resources: emptyResources(),
    guildTokens: 0,
    vouchers: 0,
    prizeCards: 0,
    developmentCards: []
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

export function createDemoGame(): GameState {
  const { board, edges } = createStandardBoardData();

  return {
    phase: "playing",
    players: createPlayers(),
    activePlayerId: "p1",
    turn: 1,
    round: 1,
    targetScore: 10,
    board,
    edges,
    buildings: [
      {
        id: "b-p1-city-pasture-8",
        ownerId: "p1",
        vertexId: "pasture-8-v0",
        kind: "city"
      },
      {
        id: "b-p2-settlement-mountain-8",
        ownerId: "p2",
        vertexId: "mountain-8-v0",
        kind: "settlement"
      }
    ],
    roads: [],
    robberHexId: "desert",
    bank: createBank(),
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
    buildings: [],
    roads: [],
    robberHexId: "desert",
    bank: createBank(),
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
