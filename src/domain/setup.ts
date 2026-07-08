import { createStandardBoard } from "./board";
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

export function createDemoGame(): GameState {
  const board = createStandardBoard();

  return {
    players: [
      createPlayer("p1", "Voyage1969", "#f2f2f2"),
      createPlayer("p2", "Loss", "#ef4444"),
      createPlayer("p3", "Kay", "#f97316"),
      createPlayer("p4", "Amias", "#2563eb")
    ],
    activePlayerId: "p1",
    turn: 1,
    round: 1,
    targetScore: 10,
    board,
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
    bank: {
      resources: {
        wood: 19,
        brick: 19,
        wool: 19,
        grain: 19,
        ore: 19
      }
    },
    log: [
      {
        id: "log-welcome",
        message: "Welcome to Catan Imitation."
      }
    ]
  };
}

