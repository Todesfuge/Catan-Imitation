import { describe, expect, it } from "vitest";

import { createCommerceGuild } from "../../src/domain/expansion/commerceGuild";
import {
  LEGACY_STANDARD_MAP_SEED,
  parseMapSeed
} from "../../src/domain/mapSeed";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import type { MatchExecutionContext, MatchState } from "../../src/domain/match/types";
import {
  createLobby,
  joinLobby,
  setLobbyReady,
  startLobby
} from "../../worker/room/roomLifecycle";
import {
  ROOM_RECORD_KEY,
  RoomSchemaError,
  RoomStore,
  type RoomStorage
} from "../../worker/room/roomStore";
import type { PersistedRoom } from "../../worker/room/roomTypes";

const DAY_MS = 86_400_000;
const HASH = "A".repeat(43);
const M1_SEED = parseMapSeed("M1-0000000000000001");
const NAMES = ["Voyage1969", "Loss", "Kay", "Amias"] as const;

class CountingStorage implements RoomStorage {
  readonly values = new Map<string, unknown>();
  roomPutCount = 0;

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async put(key: string, value: unknown): Promise<void> {
    if (key === ROOM_RECORD_KEY) this.roomPutCount += 1;
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}

  async transaction<T>(closure: (transaction: RoomStorage) => Promise<T>): Promise<T> {
    return closure(this);
  }
}

function executionContext(seed = M1_SEED): MatchExecutionContext {
  let logId = 0;
  return {
    random: { nextInt: () => 0 },
    nextMapSeed: () => seed,
    nextLogId: () => `migration-log-${++logId}`,
    now: () => 10_000
  };
}

function createV2Lobby(seatCount = 4): PersistedRoom {
  let room = createLobby({
    roomCode: "ABC234",
    seatId: "seat-1",
    nickname: NAMES[0],
    tokenHash: HASH
  }, 1_000);
  for (let index = 1; index < seatCount; index += 1) {
    room = joinLobby(room, {
      seatId: `seat-${index + 1}`,
      nickname: NAMES[index],
      tokenHash: String.fromCharCode(65 + index).repeat(43)
    }, 1_000 + index);
  }
  return room;
}

function createRichMatch(): MatchState {
  const setup = createSetupMatch(
    NAMES.map((nickname) => ({ nickname })),
    { kind: "seed", seed: LEGACY_STANDARD_MAP_SEED },
    executionContext()
  );
  const { setup: _setup, ...scenario } = setup.game;
  const [heldCard, ...developmentDeck] = scenario.developmentDeck;
  const firstHex = scenario.board[0];
  const secondHex = scenario.board[1];
  return {
    game: {
      ...scenario,
      phase: "playing",
      activePlayerId: "p2",
      turn: 17,
      round: 5,
      turnState: { phase: "action", pendingDiscards: {}, developmentCardPlayed: false },
      players: scenario.players.map((player, index) => ({
        ...player,
        resources: index === 0
          ? { wood: 2, brick: 1, wool: 3, grain: 0, ore: 4 }
          : index === 1
            ? { ...player.resources, wood: 1 }
            : player.resources,
        guildTokens: index === 0 ? 6 : index,
        developmentCards: index === 0 ? [{ ...heldCard, purchasedTurn: 9 }] : [],
        knightsPlayed: index === 0 ? 3 : 0
      })),
      developmentDeck,
      buildings: [
        { id: "building-preserved-1", ownerId: "p1", vertexId: firstHex.vertexIds[0], kind: "city" },
        { id: "building-preserved-2", ownerId: "p2", vertexId: secondHex.vertexIds[0], kind: "settlement" }
      ],
      roads: [
        { id: "road-preserved-1", ownerId: "p1", edgeId: firstHex.edgeIds[0] },
        { id: "road-preserved-2", ownerId: "p2", edgeId: secondHex.edgeIds[0] }
      ],
      largestArmyOwnerId: "p1",
      longestRoadOwnerId: "p2",
      log: [
        ...scenario.log,
        { id: "log-preserved", message: "Preserve this exact log entry." }
      ]
    },
    guild: {
      ...createCommerceGuild(),
      usedTradePlayerIds: ["p3"],
      gathering: {
        phase: "auction",
        redemptions: { p1: 2 },
        auctionRound: 2,
        auctionResults: [{ kind: "voucher" }],
        lastAuctionSummary: "Preserve the auction summary."
      }
    },
    lastDice: { first: 4, second: 5, total: 9 },
    pendingPlayerTrade: {
      proposerId: "p2",
      offered: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
      requested: { wood: 0, brick: 1, wool: 0, grain: 0, ore: 0 }
    }
  };
}

function createV2Playing(): PersistedRoom {
  const lobby = createV2Lobby();
  const matchState = createRichMatch();
  return {
    ...lobby,
    lifecycle: "playing",
    lastActivityAt: 8_000,
    expiresAt: 8_000 + DAY_MS,
    roomVersion: 41,
    seats: lobby.seats.map((seat, index) => ({
      ...seat,
      playerId: matchState.game.players[index].id,
      ready: true,
      acceptedCommandIds: [{ commandId: `accepted-${index}`, resultingVersion: 40 }],
      commandAttemptTimestamps: [7_000 + index]
    })),
    matchState,
    connectionTickets: [{
      ticketHash: "T".repeat(43),
      seatId: "seat-2",
      expiresAt: 20_000
    }],
    pendingAuction: { round: 2, bidsBySeatId: { "seat-1": 4, "seat-3": 1 } }
  };
}

function createV2Finished(): PersistedRoom {
  const playing = createV2Playing();
  const { pendingAuction: _pendingAuction, ...room } = playing;
  const { pendingPlayerTrade: _pendingPlayerTrade, ...matchState } = playing.matchState!;
  return {
    ...room,
    lifecycle: "finished",
    roomVersion: 42,
    matchState: {
      ...matchState,
      game: {
        ...matchState.game,
        phase: "gameOver",
        winnerId: "p1"
      }
    }
  };
}

function createV2SetupPlaying(): PersistedRoom {
  const lobby = createV2Lobby();
  const matchState = createSetupMatch(
    NAMES.map((nickname) => ({ nickname })),
    { kind: "seed", seed: LEGACY_STANDARD_MAP_SEED },
    executionContext()
  );
  return {
    ...lobby,
    lifecycle: "playing",
    lastActivityAt: 8_000,
    expiresAt: 8_000 + DAY_MS,
    roomVersion: 21,
    seats: lobby.seats.map((seat, index) => ({
      ...seat,
      playerId: matchState.game.players[index].id,
      ready: true
    })),
    matchState
  };
}

function toLegacyRecord(room: PersistedRoom): Record<string, unknown> {
  const legacy = structuredClone(room) as Record<string, any>;
  legacy.schemaVersion = 1;
  if (legacy.matchState) delete legacy.matchState.game.mapSeed;
  if (legacy.pendingAuction === undefined) delete legacy.pendingAuction;
  return legacy;
}

function expectedMigration(raw: Record<string, unknown>): PersistedRoom {
  const expected = structuredClone(raw) as Record<string, any>;
  expected.schemaVersion = 2;
  if (expected.matchState) expected.matchState.game.mapSeed = "M0-STANDARD";
  return expected as PersistedRoom;
}

function corruptedLegacy(
  mutate: (game: Record<string, any>) => void
): Record<string, unknown> {
  const raw = toLegacyRecord(createV2Playing());
  mutate((raw.matchState as Record<string, any>).game);
  return raw;
}

function snapshotOwnValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snapshotOwnValues);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).map((key) => [
      key,
      snapshotOwnValues((value as Record<string, unknown>)[key])
    ])
  );
}

function matchRecord(raw: Record<string, unknown>): Record<string, any> {
  return raw.matchState as Record<string, any>;
}

function gameRecord(raw: Record<string, unknown>): Record<string, any> {
  return matchRecord(raw).game;
}

interface InvalidStoredRoomCase {
  name: string;
  createRoom?: () => PersistedRoom;
  mutate(raw: Record<string, unknown>): void;
}

const invalidStoredRoomCases: InvalidStoredRoomCase[] = [
  { name: "missing bank", mutate: (raw) => { delete gameRecord(raw).bank; } },
  { name: "missing turnState", mutate: (raw) => { delete gameRecord(raw).turnState; } },
  { name: "unknown nested game key", mutate: (raw) => { gameRecord(raw).debugState = true; } },
  { name: "explicit undefined optional game field", mutate: (raw) => { gameRecord(raw).winnerId = undefined; } },
  { name: "explicit undefined required game field", mutate: (raw) => { gameRecord(raw).bank = undefined; } },
  {
    name: "inherited required game field",
    mutate(raw) {
      const game = gameRecord(raw);
      const phase = game.phase;
      delete game.phase;
      Object.setPrototypeOf(game, { phase });
    }
  },
  { name: "non-finite turn", mutate: (raw) => { gameRecord(raw).turn = Number.POSITIVE_INFINITY; } },
  {
    name: "unsafe player resource count",
    mutate: (raw) => { gameRecord(raw).players[0].resources.wood = Number.MAX_SAFE_INTEGER + 1; }
  },
  { name: "non-finite dice value", mutate: (raw) => { matchRecord(raw).lastDice.first = Number.NaN; } },
  {
    name: "unsafe guild reward",
    mutate: (raw) => { matchRecord(raw).guild.tradeSlots[0].tokenReward = Number.MAX_SAFE_INTEGER + 1; }
  },
  {
    name: "unsafe sealed bid",
    mutate: (raw) => {
      (raw.pendingAuction as Record<string, any>).bidsBySeatId["seat-1"] = Number.MAX_SAFE_INTEGER + 1;
    }
  },
  { name: "unknown robber hex", mutate: (raw) => { gameRecord(raw).robberHexId = "hex-missing"; } },
  {
    name: "unknown building owner",
    mutate: (raw) => { gameRecord(raw).buildings[0].ownerId = "player-missing"; }
  },
  {
    name: "unknown building vertex",
    mutate: (raw) => { gameRecord(raw).buildings[0].vertexId = "vertex-missing"; }
  },
  { name: "unknown road owner", mutate: (raw) => { gameRecord(raw).roads[0].ownerId = "player-missing"; } },
  { name: "unknown road edge", mutate: (raw) => { gameRecord(raw).roads[0].edgeId = "edge-missing"; } },
  {
    name: "unknown setup player",
    createRoom: createV2SetupPlaying,
    mutate: (raw) => { gameRecord(raw).setup.order[0] = "player-missing"; }
  },
  {
    name: "unknown setup pending vertex",
    createRoom: createV2SetupPlaying,
    mutate(raw) {
      const game = gameRecord(raw);
      game.setup.stage = "road";
      game.setup.pendingSettlement = {
        playerId: game.activePlayerId,
        vertexId: "vertex-missing"
      };
    }
  },
  {
    name: "unknown turn pending player",
    mutate(raw) {
      gameRecord(raw).turnState = {
        phase: "awaitingDevelopmentEffect",
        pendingDiscards: {},
        pendingDevelopmentEffect: {
          kind: "monopoly",
          playerId: "player-missing",
          resumePhase: "action"
        },
        developmentCardPlayed: true
      };
    }
  },
  {
    name: "malformed player resources",
    mutate: (raw) => { delete gameRecord(raw).players[0].resources.ore; }
  },
  {
    name: "malformed player development card",
    mutate: (raw) => { gameRecord(raw).players[0].developmentCards[0].revealed = "no"; }
  },
  {
    name: "malformed development deck card",
    mutate: (raw) => { gameRecord(raw).developmentDeck[0].kind = "unknown-card"; }
  },
  { name: "invalid bank resources", mutate: (raw) => { gameRecord(raw).bank.resources.wood = -1; } },
  {
    name: "invalid log params",
    mutate: (raw) => { gameRecord(raw).log[0].params = { total: Number.NaN }; }
  },
  {
    name: "invalid guild trade slots",
    mutate: (raw) => { matchRecord(raw).guild.tradeSlots[0].requires = { unknown: 1 }; }
  },
  {
    name: "invalid guild gathering",
    mutate: (raw) => { matchRecord(raw).guild.gathering.phase = "unknown-phase"; }
  },
  {
    name: "invalid guild outcome",
    mutate: (raw) => { matchRecord(raw).guild.gathering.auctionResults[0] = { kind: "unknown" }; }
  },
  {
    name: "malformed lastDice total",
    mutate: (raw) => { matchRecord(raw).lastDice.total = 2; }
  },
  {
    name: "malformed player trade proposer",
    mutate: (raw) => { matchRecord(raw).pendingPlayerTrade.proposerId = "player-missing"; }
  },
  {
    name: "unknown largest-army owner",
    mutate: (raw) => { gameRecord(raw).largestArmyOwnerId = "player-missing"; }
  },
  {
    name: "unknown winner",
    createRoom: createV2Finished,
    mutate: (raw) => { gameRecord(raw).winnerId = "player-missing"; }
  },
  {
    name: "setup phase without setup state",
    createRoom: createV2SetupPlaying,
    mutate: (raw) => { delete gameRecord(raw).setup; }
  },
  {
    name: "playing phase with setup state",
    createRoom: createV2SetupPlaying,
    mutate: (raw) => { gameRecord(raw).phase = "playing"; }
  },
  {
    name: "finished lifecycle with playing phase",
    mutate: (raw) => { raw.lifecycle = "finished"; }
  },
  {
    name: "game-over phase without winner",
    createRoom: createV2Finished,
    mutate: (raw) => { delete gameRecord(raw).winnerId; }
  }
];

const rawValidationMatrix = invalidStoredRoomCases.flatMap((testCase) => [
  { name: `v1 ${testCase.name}`, schema: "v1" as const, testCase },
  { name: `v2 ${testCase.name}`, schema: "v2" as const, testCase }
]);

describe("persisted room schema v2", () => {
  it("creates and writes schema-v2 lobbies without match state", async () => {
    const room = createLobby({
      roomCode: "ABC234",
      seatId: "seat-1",
      nickname: "Host",
      tokenHash: HASH
    }, 1_000);

    expect(room.schemaVersion).toBe(2);
    expect(Object.hasOwn(room, "matchState")).toBe(false);
    const storage = new CountingStorage();
    await expect(new RoomStore(storage).createIfEmpty(room)).resolves.toBe("created");
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(room);
  });

  it("starts a fresh canonical M1 match and stores exact seed-derived board data", async () => {
    let room = createV2Lobby(3);
    for (const seat of room.seats) {
      room = setLobbyReady(room, seat.seatId, true, 3_000 + seat.joinOrder);
    }

    const started = startLobby(room, room.hostSeatId, executionContext(), 10_000);
    expect(started.schemaVersion).toBe(2);
    expect(started.matchState?.game.mapSeed).toBe(M1_SEED);
    await expect(new RoomStore(new CountingStorage()).save(started)).resolves.toBeUndefined();
  });

  it.each([
    "m1-0000000000000001",
    "M1-000000000000001",
    "M2-0000000000000001"
  ])("rejects malformed or unsupported v2 seed %s without writing", async (mapSeed) => {
    const storage = new CountingStorage();
    const room = createV2Playing();
    await expect(new RoomStore(new CountingStorage()).save(room)).resolves.toBeUndefined();
    const malformed = {
      ...room,
      matchState: {
        ...room.matchState!,
        game: { ...room.matchState!.game, mapSeed }
      }
    } as PersistedRoom;
    const before = structuredClone(malformed);
    storage.values.set(ROOM_RECORD_KEY, malformed);

    await expect(new RoomStore(storage).load(10_000)).rejects.toBeInstanceOf(RoomSchemaError);
    expect(storage.values.get(ROOM_RECORD_KEY)).toBe(malformed);
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(before);
    expect(storage.roomPutCount).toBe(0);
  });

  it("rejects missing seeds and seed/board mismatches in v2 playing and finished rooms", async () => {
    await expect(new RoomStore(new CountingStorage()).save(createV2Playing()))
      .resolves.toBeUndefined();
    const playing = structuredClone(createV2Playing()) as Record<string, any>;
    delete playing.matchState.game.mapSeed;
    const finished = createV2Finished();
    const mismatched = {
      ...finished,
      matchState: {
        ...finished.matchState!,
        game: { ...finished.matchState!.game, mapSeed: M1_SEED }
      }
    };

    for (const invalid of [playing, mismatched]) {
      const storage = new CountingStorage();
      await expect(new RoomStore(storage).save(invalid as PersistedRoom))
        .rejects.toBeInstanceOf(RoomSchemaError);
      expect(storage.roomPutCount).toBe(0);
    }
  });
});

describe("complete raw persisted match validation", () => {
  it.each(rawValidationMatrix)(
    "rejects $name without writing or mutating raw storage",
    async ({ schema, testCase }) => {
      const room = testCase.createRoom?.() ?? createV2Playing();
      const raw = schema === "v1"
        ? toLegacyRecord(room)
        : structuredClone(room) as unknown as Record<string, unknown>;
      testCase.mutate(raw);
      const before = snapshotOwnValues(raw);
      const storage = new CountingStorage();
      storage.values.set(ROOM_RECORD_KEY, raw);

      await expect(new RoomStore(storage).load(10_000))
        .rejects.toBeInstanceOf(RoomSchemaError);

      expect(storage.values.get(ROOM_RECORD_KEY)).toBe(raw);
      expect(snapshotOwnValues(storage.values.get(ROOM_RECORD_KEY))).toEqual(before);
      expect(storage.roomPutCount).toBe(0);
    }
  );

  it.each(["v1", "v2"] as const)(
    "rejects %s lobby with an explicitly undefined matchState without writing",
    async (schema) => {
      const raw = schema === "v1"
        ? toLegacyRecord(createV2Lobby())
        : structuredClone(createV2Lobby()) as unknown as Record<string, unknown>;
      raw.matchState = undefined;
      const before = snapshotOwnValues(raw);
      const storage = new CountingStorage();
      storage.values.set(ROOM_RECORD_KEY, raw);

      await expect(new RoomStore(storage).load(10_000))
        .rejects.toBeInstanceOf(RoomSchemaError);

      expect(storage.values.get(ROOM_RECORD_KEY)).toBe(raw);
      expect(snapshotOwnValues(storage.values.get(ROOM_RECORD_KEY))).toEqual(before);
      expect(storage.roomPutCount).toBe(0);
    }
  );
});

describe("legacy persisted-room migration", () => {
  it("migrates a v1 lobby by changing only schemaVersion", async () => {
    const v2 = {
      ...createV2Lobby(2),
      roomVersion: 19,
      connectionTickets: [{
        ticketHash: "V".repeat(43),
        seatId: "seat-1",
        expiresAt: 20_000
      }]
    };
    const raw = toLegacyRecord(v2);
    const storage = new CountingStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    const loaded = await new RoomStore(storage).load(10_000);

    expect(loaded).toEqual(expectedMigration(raw));
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(loaded);
    expect(storage.roomPutCount).toBe(1);
  });

  it.each([
    ["playing", createV2Playing],
    ["finished", createV2Finished]
  ] as const)("migrates an exact released v1 %s board while preserving all live state", async (
    _lifecycle,
    createRoom
  ) => {
    const raw = toLegacyRecord(createRoom());
    const storage = new CountingStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    const loaded = await new RoomStore(storage).load(10_000);

    expect(loaded).toEqual(expectedMigration(raw));
    expect(loaded?.roomVersion).toBe(raw.roomVersion);
    expect(loaded?.matchState?.game.mapSeed).toBe("M0-STANDARD");
    expect(storage.roomPutCount).toBe(1);
  });

  it.each([
    ["terrain", (game: Record<string, any>) => { game.board[0].terrain = "desert"; }],
    ["number", (game: Record<string, any>) => { game.board[0].diceNumber = 12; }],
    ["vertex reference", (game: Record<string, any>) => { game.board[0].vertexIds[0] = "vertex-corrupt"; }],
    ["edge reference", (game: Record<string, any>) => { game.board[0].edgeIds[0] = "edge-corrupt"; }],
    ["port type", (game: Record<string, any>) => {
      game.ports[0] = { ...game.ports[0], kind: "resource", resource: "ore" };
    }],
    ["port position", (game: Record<string, any>) => { game.ports[0].vertexIds.reverse(); }],
    ["board count", (game: Record<string, any>) => { game.board.pop(); }],
    ["non-finite number", (game: Record<string, any>) => { game.board[0].diceNumber = Number.NaN; }],
    ["undefined static field", (game: Record<string, any>) => { game.edges[0].vertexIds = undefined; }]
  ])("rejects v1 %s corruption without mutating raw storage", async (_name, mutate) => {
    const raw = corruptedLegacy(mutate);
    const before = structuredClone(raw);
    const storage = new CountingStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    await expect(new RoomStore(storage).load(10_000)).rejects.toBeInstanceOf(RoomSchemaError);

    expect(storage.values.get(ROOM_RECORD_KEY)).toBe(raw);
    expect(storage.values.get(ROOM_RECORD_KEY)).toEqual(before);
    expect(storage.roomPutCount).toBe(0);
  });

  it("coalesces v1 migration, expired-ticket cleanup, and mutation into one validated write", async () => {
    const raw = toLegacyRecord({
      ...createV2Lobby(),
      connectionTickets: [
        { ticketHash: "X".repeat(43), seatId: "seat-1", expiresAt: 9_999 },
        { ticketHash: "Y".repeat(43), seatId: "seat-2", expiresAt: 20_000 }
      ]
    });
    const storage = new CountingStorage();
    storage.values.set(ROOM_RECORD_KEY, raw);

    const result = await new RoomStore(storage).mutateLatest(10_000, (room) => ({
      kind: "updated",
      room: { ...room, roomVersion: room.roomVersion + 1 },
      value: "updated" as const
    }));

    expect(result).toMatchObject({
      kind: "active",
      value: "updated",
      room: {
        schemaVersion: 2,
        roomVersion: (raw.roomVersion as number) + 1,
        connectionTickets: [{ ticketHash: "Y".repeat(43) }]
      }
    });
    expect(storage.roomPutCount).toBe(1);
    await expect(new RoomStore(storage).load(10_000)).resolves.toMatchObject({ schemaVersion: 2 });
    expect(storage.roomPutCount).toBe(1);
  });
});
