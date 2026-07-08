export const resources = ["wood", "brick", "wool", "grain", "ore"] as const;

export type Resource = (typeof resources)[number];

export type ResourceMap = Record<Resource, number>;

export type PlayerId = string;
export type HexId = string;
export type VertexId = string;

export type Terrain = "forest" | "hill" | "pasture" | "field" | "mountain" | "desert";

export type BuildingKind = "settlement" | "city";

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  resources: ResourceMap;
  guildTokens: number;
  vouchers: number;
  prizeCards: number;
  developmentCards: string[];
}

export interface BoardHex {
  id: HexId;
  terrain: Terrain;
  resource: Resource | null;
  diceNumber: number | null;
  vertexIds: VertexId[];
  q: number;
  r: number;
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
  edgeId: string;
}

export interface Bank {
  resources: ResourceMap;
}

export interface GameLogEntry {
  id: string;
  message: string;
}

export interface GameState {
  players: Player[];
  activePlayerId: PlayerId;
  turn: number;
  round: number;
  targetScore: number;
  board: BoardHex[];
  buildings: Building[];
  roads: Road[];
  robberHexId: HexId;
  bank: Bank;
  log: GameLogEntry[];
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

