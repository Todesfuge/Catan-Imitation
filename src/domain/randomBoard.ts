import {
  createStandardBoardData,
  createStandardBoardTopology,
  orderStandardCoastalEdges,
  type StandardBoardData,
  type StandardHexTopology
} from "./board";
import {
  LEGACY_STANDARD_MAP_SEED,
  createMapRandomSource,
  type MapSeed
} from "./mapSeed";
import type { RandomSource } from "./match/random";
import { resources, type MaritimePort, type Resource, type Terrain } from "./types";

type ProductiveTerrain = Exclude<Terrain, "desert">;
type TerrainPlan =
  | { terrain: ProductiveTerrain; resource: Resource }
  | { terrain: "desert"; resource: null };
type PortPlan = { kind: "generic" } | { kind: "resource"; resource: Resource };

const TERRAIN_PLAN: TerrainPlan[] = [
  ...Array.from({ length: 4 }, () => ({ terrain: "forest" as const, resource: "wood" as const })),
  ...Array.from({ length: 4 }, () => ({ terrain: "pasture" as const, resource: "wool" as const })),
  ...Array.from({ length: 4 }, () => ({ terrain: "field" as const, resource: "grain" as const })),
  ...Array.from({ length: 3 }, () => ({ terrain: "hill" as const, resource: "brick" as const })),
  ...Array.from({ length: 3 }, () => ({ terrain: "mountain" as const, resource: "ore" as const })),
  { terrain: "desert", resource: null }
];

const RED_NUMBER_TOKENS = [6, 6, 8, 8] as const;
const OTHER_NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 9, 9, 10, 10, 11, 11, 12] as const;
const PORT_PLAN: PortPlan[] = [
  { kind: "generic" },
  { kind: "generic" },
  { kind: "generic" },
  { kind: "generic" },
  ...resources.map((resource) => ({ kind: "resource" as const, resource }))
];

const COASTAL_EDGE_COUNT = 30;
const PORT_COUNT = 9;
const PATH_COUNTS = buildPathIndependentSetCounts(COASTAL_EDGE_COUNT, PORT_COUNT);

function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const targetIndex = random.nextInt(index + 1);
    [result[index], result[targetIndex]] = [result[targetIndex], result[index]];
  }
  return result;
}

function buildHexAdjacency(board: readonly StandardHexTopology[]): Set<string> {
  const hexIndicesByEdge = new Map<string, number[]>();
  for (let hexIndex = 0; hexIndex < board.length; hexIndex += 1) {
    for (const edgeId of board[hexIndex].edgeIds) {
      hexIndicesByEdge.set(edgeId, [...(hexIndicesByEdge.get(edgeId) ?? []), hexIndex]);
    }
  }

  const adjacency = new Set<string>();
  for (const indices of hexIndicesByEdge.values()) {
    if (indices.length === 2) {
      adjacency.add(`${indices[0]}:${indices[1]}`);
      adjacency.add(`${indices[1]}:${indices[0]}`);
    }
  }
  return adjacency;
}

function enumerateRedTokenSets(
  nonDesertIndices: readonly number[],
  adjacency: ReadonlySet<string>
): number[][] {
  const candidates: number[][] = [];
  for (let first = 0; first < nonDesertIndices.length - 3; first += 1) {
    for (let second = first + 1; second < nonDesertIndices.length - 2; second += 1) {
      for (let third = second + 1; third < nonDesertIndices.length - 1; third += 1) {
        for (let fourth = third + 1; fourth < nonDesertIndices.length; fourth += 1) {
          const candidate = [
            nonDesertIndices[first],
            nonDesertIndices[second],
            nonDesertIndices[third],
            nonDesertIndices[fourth]
          ];
          if (
            candidate.every((left, leftIndex) =>
              candidate.slice(leftIndex + 1).every((right) => !adjacency.has(`${left}:${right}`))
            )
          ) {
            candidates.push(candidate);
          }
        }
      }
    }
  }
  return candidates;
}

function buildPathIndependentSetCounts(maxLength: number, maxSelected: number): number[][] {
  const counts = Array.from({ length: maxLength + 1 }, () =>
    Array.from({ length: maxSelected + 1 }, () => 0)
  );
  counts[0][0] = 1;
  counts[1][0] = 1;
  counts[1][1] = 1;

  for (let length = 2; length <= maxLength; length += 1) {
    counts[length][0] = 1;
    for (let selected = 1; selected <= maxSelected; selected += 1) {
      counts[length][selected] =
        counts[length - 1][selected] + counts[length - 2][selected - 1];
    }
  }
  return counts;
}

function countPathIndependentSets(length: number, selected: number): number {
  if (selected === 0) {
    return 1;
  }
  if (length < 0 || selected < 0 || length >= PATH_COUNTS.length) {
    return 0;
  }
  return PATH_COUNTS[length][selected] ?? 0;
}

function unrankPathIndependentSet(
  startIndex: number,
  length: number,
  selected: number,
  initialRank: number
): number[] {
  const result: number[] = [];
  const endIndex = startIndex + length;
  let nextIndex = startIndex;
  let remaining = selected;
  let rank = initialRank;

  while (remaining > 0) {
    const finalCandidate = endIndex - (remaining * 2 - 1);
    let found = false;
    for (let candidate = nextIndex; candidate <= finalCandidate; candidate += 1) {
      const tailLength = Math.max(0, endIndex - (candidate + 2));
      const completions = countPathIndependentSets(tailLength, remaining - 1);
      if (rank < completions) {
        result.push(candidate);
        nextIndex = candidate + 2;
        remaining -= 1;
        found = true;
        break;
      }
      rank -= completions;
    }

    if (!found) {
      throw new Error("Port independent-set rank exceeded the bounded candidate count.");
    }
  }
  return result;
}

function unrankCycleIndependentSet(length: number, selected: number, rank: number): number[] {
  const includingFirstCount = countPathIndependentSets(length - 3, selected - 1);
  if (rank < includingFirstCount) {
    return [0, ...unrankPathIndependentSet(2, length - 3, selected - 1, rank)];
  }
  return unrankPathIndependentSet(1, length - 1, selected, rank - includingFirstCount);
}

function selectPortEdges(random: RandomSource): number[] {
  const includingFirstCount = countPathIndependentSets(COASTAL_EDGE_COUNT - 3, PORT_COUNT - 1);
  const excludingFirstCount = countPathIndependentSets(COASTAL_EDGE_COUNT - 1, PORT_COUNT);
  const rank = random.nextInt(includingFirstCount + excludingFirstCount);
  return unrankCycleIndependentSet(COASTAL_EDGE_COUNT, PORT_COUNT, rank);
}

function createM1BoardData(seed: MapSeed): StandardBoardData {
  const random = createMapRandomSource(seed);
  const { board: topology, edges } = createStandardBoardTopology();
  const terrain = shuffle(TERRAIN_PLAN, random);
  const nonDesertIndices = terrain.flatMap((plan, index) =>
    plan.terrain === "desert" ? [] : [index]
  );
  const redCandidates = enumerateRedTokenSets(nonDesertIndices, buildHexAdjacency(topology));
  const redIndices = redCandidates[random.nextInt(redCandidates.length)];
  const redNumbers = shuffle(RED_NUMBER_TOKENS, random);
  const numberByHexIndex = new Map<number, number>();
  redIndices.forEach((hexIndex, index) => numberByHexIndex.set(hexIndex, redNumbers[index]));

  const redIndexSet = new Set(redIndices);
  const otherIndices = nonDesertIndices.filter((index) => !redIndexSet.has(index));
  const otherNumbers = shuffle(OTHER_NUMBER_TOKENS, random);
  otherIndices.forEach((hexIndex, index) => numberByHexIndex.set(hexIndex, otherNumbers[index]));

  const board = topology.map((geometry, index) => ({
    id: geometry.id,
    terrain: terrain[index].terrain,
    resource: terrain[index].resource,
    diceNumber: numberByHexIndex.get(index) ?? null,
    q: geometry.q,
    r: geometry.r,
    vertexIds: geometry.vertexIds,
    edgeIds: geometry.edgeIds
  }));

  const coastalEdges = orderStandardCoastalEdges(board, edges);
  if (coastalEdges.length !== COASTAL_EDGE_COUNT) {
    throw new Error("Standard board topology must have exactly thirty coastal edges.");
  }
  const portEdges = selectPortEdges(random).map((index) => coastalEdges[index]);
  const portKinds = shuffle(PORT_PLAN, random);
  const ports: MaritimePort[] = portEdges.map((edge, index) => ({
    id: `port-${edge.id}`,
    ...portKinds[index],
    vertexIds: [...edge.vertexIds]
  }));

  return { board, edges, ports };
}

function strictStructuralEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) {
    return false;
  }

  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject);
  const rightKeys = Object.keys(rightObject);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
    Object.hasOwn(rightObject, key) &&
    strictStructuralEqual(leftObject[key], rightObject[key])
  );
}

export function createBoardDataForSeed(seed: MapSeed): StandardBoardData {
  return seed === LEGACY_STANDARD_MAP_SEED ? createStandardBoardData() : createM1BoardData(seed);
}

export function matchesBoardDataForSeed(value: unknown, seed: MapSeed): boolean {
  return strictStructuralEqual(value, createBoardDataForSeed(seed));
}
