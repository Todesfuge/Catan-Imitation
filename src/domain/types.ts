import type { MapSeed } from "./mapSeed";

export const resources = ["wood", "brick", "wool", "grain", "ore"] as const;

export type Resource = (typeof resources)[number];

export type ResourceMap = Record<Resource, number>;

export type PlayerId = string;
export type HexId = string;
export type VertexId = string;
export type EdgeId = string;

export type Terrain = "forest" | "hill" | "pasture" | "field" | "mountain" | "desert";

export type BuildingKind = "settlement" | "city";
export type GamePhase = "setup" | "playing" | "gameOver";
export type SetupStage = "settlement" | "road";
export type TurnPhase =
  | "awaitingRoll"
  | "awaitingDiscards"
  | "awaitingRobberPlacement"
  | "awaitingRobberVictim"
  | "awaitingDevelopmentEffect"
  | "action";
export type DevelopmentCardKind = "knight" | "victoryPoint" | "roadBuilding" | "yearOfPlenty" | "monopoly";
export type PortKind = "generic" | "resource";

export interface DevelopmentCard {
  id: string;
  kind: DevelopmentCardKind;
  purchasedTurn: number;
  revealed: boolean;
}

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  resources: ResourceMap;
  guildTokens: number;
  vouchers: number;
  prizeCards: number;
  developmentCards: DevelopmentCard[];
  knightsPlayed: number;
}

export interface BoardHex {
  id: HexId;
  terrain: Terrain;
  resource: Resource | null;
  diceNumber: number | null;
  vertexIds: VertexId[];
  edgeIds: EdgeId[];
  q: number;
  r: number;
}

export interface BoardEdge {
  id: EdgeId;
  hexId: HexId;
  vertexIds: [VertexId, VertexId];
}

export interface MaritimePort {
  id: string;
  kind: PortKind;
  resource?: Resource;
  vertexIds: VertexId[];
}

export interface Building {
  id: string;
  ownerId: PlayerId;
  vertexId: VertexId;
  kind: BuildingKind;
}

export interface Road {
  id: string;
  ownerId: PlayerId;
  edgeId: EdgeId;
}

export interface Bank {
  resources: ResourceMap;
}

export interface GameLogEntry {
  id: string;
  message: string;
  messageKey?: GameMessageKey;
  params?: Record<string, string | number>;
}

export type GameMessageKey =
  | "game.welcome"
  | "setup.started"
  | "setup.newGameStarted"
  | "dice.rolled"
  | "robber.sevenRolled"
  | "robber.discardCompleted"
  | "robber.moved"
  | "robber.stolen"
  | "development.played"
  | "development.bought"
  | "development.knightPlayed"
  | "development.freeRoadPlaced"
  | "development.yearOfPlentyLog"
  | "development.monopolyLog"
  | "trade.maritime"
  | "trade.player.published"
  | "trade.player.cancelled"
  | "trade.player.accepted"
  | "guild.gatheringAutoStarted"
  | "guild.slotCompleted"
  | "guild.tokensTransferred"
  | "guild.gatheringStarted"
  | "guild.auctionOpened"
  | "guild.auctionNoEligibleBidders"
  | "guild.auctionRoundNoBids"
  | "guild.redeemedResources"
  | "guild.auctionResolved"
  | "guild.prizeRedeemed";

export interface SetupState {
  order: PlayerId[];
  placementIndex: number;
  stage: SetupStage;
  pendingSettlement?: {
    playerId: PlayerId;
    vertexId: VertexId;
  };
}

export interface PendingRobber {
  source: "seven" | "knight";
  resumePhase: "awaitingRoll" | "action";
  targetHexId?: HexId;
  eligibleVictimIds: PlayerId[];
}

export type PendingDevelopmentEffect =
  | {
      kind: "roadBuilding";
      playerId: PlayerId;
      remainingRoads: number;
      resumePhase: "awaitingRoll" | "action";
    }
  | {
      kind: "yearOfPlenty";
      playerId: PlayerId;
      remainingPicks: number;
      resumePhase: "awaitingRoll" | "action";
    }
  | {
      kind: "monopoly";
      playerId: PlayerId;
      resumePhase: "awaitingRoll" | "action";
    };

export interface TurnState {
  phase: TurnPhase;
  pendingDiscards: Partial<Record<PlayerId, number>>;
  pendingRobber?: PendingRobber;
  pendingDevelopmentEffect?: PendingDevelopmentEffect;
  developmentCardPlayed?: boolean;
}

export interface GameState {
  mapSeed: MapSeed;
  phase: GamePhase;
  players: Player[];
  activePlayerId: PlayerId;
  turn: number;
  round: number;
  turnState: TurnState;
  targetScore: number;
  board: BoardHex[];
  edges: BoardEdge[];
  ports: MaritimePort[];
  buildings: Building[];
  roads: Road[];
  robberHexId: HexId;
  bank: Bank;
  log: GameLogEntry[];
  developmentDeck: DevelopmentCard[];
  setup?: SetupState;
  winnerId?: PlayerId;
  largestArmyOwnerId?: PlayerId;
  longestRoadOwnerId?: PlayerId;
}

export interface ProductionEvent {
  playerId: PlayerId;
  hexId: HexId;
  resource: Resource;
  amount: number;
  buildingId: string;
}

export interface ProductionResult {
  byPlayer: Record<PlayerId, ResourceMap>;
  events: ProductionEvent[];
}

export function emptyResources(): ResourceMap {
  return {
    wood: 0,
    brick: 0,
    wool: 0,
    grain: 0,
    ore: 0
  };
}

export function addResourceMaps(left: ResourceMap, right: ResourceMap): ResourceMap {
  return {
    wood: left.wood + right.wood,
    brick: left.brick + right.brick,
    wool: left.wool + right.wool,
    grain: left.grain + right.grain,
    ore: left.ore + right.ore
  };
}

export function scaleResources(resourcesMap: ResourceMap, multiplier: number): ResourceMap {
  return {
    wood: resourcesMap.wood * multiplier,
    brick: resourcesMap.brick * multiplier,
    wool: resourcesMap.wool * multiplier,
    grain: resourcesMap.grain * multiplier,
    ore: resourcesMap.ore * multiplier
  };
}
