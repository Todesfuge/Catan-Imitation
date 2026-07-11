import type { CommerceGuildState } from "../../src/domain/expansion/commerceGuild";
import type { MatchState } from "../../src/domain/match/types";
import type { GameState, Player } from "../../src/domain/types";
import type { ConnectionTicket, PersistedRoom, PersistedSeat } from "./roomTypes";
import { hashesMatch } from "../crypto";
import {
  joinLobby,
  leaveLobby,
  refreshRoomActivity,
  type NewSeatInput
} from "./roomLifecycle";

export const ROOM_RECORD_KEY = "room";
export const ROOM_EXPIRED_KEY = "expired";

export interface RoomStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean | void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
  transaction?<T>(closure: (transaction: RoomStorage) => Promise<T>): Promise<T>;
}

export type RoomLookup =
  | { kind: "active"; room: PersistedRoom }
  | { kind: "expired"; expiredAt: number }
  | { kind: "missing" };

export class RoomSchemaError extends Error {
  constructor() {
    super("Persisted room schema is incompatible.");
    this.name = "RoomSchemaError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function acceptedCommand(value: unknown): boolean {
  return record(value) &&
    exactKeys(value, ["commandId", "resultingVersion"]) &&
    typeof value.commandId === "string" && value.commandId.length > 0 &&
    integer(value.resultingVersion);
}

function seat(value: unknown): value is PersistedSeat {
  if (!record(value) || !exactKeys(value, [
    "seatId", "nickname", "normalizedNickname", "tokenHash", "joinedAt",
    "joinOrder", "ready", "acceptedCommandIds"
  ], ["playerId"])) return false;
  return typeof value.seatId === "string" && value.seatId.length > 0 &&
    typeof value.nickname === "string" && [...value.nickname].length >= 1 &&
    [...value.nickname].length <= 20 &&
    value.nickname.normalize("NFKC").trim() === value.nickname &&
    typeof value.normalizedNickname === "string" &&
    value.normalizedNickname === value.nickname.toLocaleLowerCase() &&
    hash(value.tokenHash) && integer(value.joinedAt) && integer(value.joinOrder, 1) &&
    typeof value.ready === "boolean" &&
    (value.playerId === undefined || (typeof value.playerId === "string" && value.playerId.length > 0)) &&
    Array.isArray(value.acceptedCommandIds) && value.acceptedCommandIds.length <= 64 &&
    value.acceptedCommandIds.every(acceptedCommand);
}

function ticket(value: unknown): value is ConnectionTicket {
  return record(value) && exactKeys(value, ["ticketHash", "seatId", "expiresAt"]) &&
    hash(value.ticketHash) && typeof value.seatId === "string" && value.seatId.length > 0 &&
    integer(value.expiresAt);
}

function player(value: unknown): value is Player {
  return record(value) && typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && integer(value.guildTokens);
}

function gameState(value: unknown): value is GameState {
  if (!record(value) || !["setup", "playing", "gameOver"].includes(String(value.phase)) ||
    !Array.isArray(value.players) || !value.players.every(player) ||
    typeof value.activePlayerId !== "string" || !integer(value.round, 1)) return false;
  return value.players.some((candidate) => candidate.id === value.activePlayerId);
}

function guildState(value: unknown): value is CommerceGuildState {
  if (!record(value) || !Array.isArray(value.tradeSlots) ||
    !Array.isArray(value.usedTradePlayerIds) || !record(value.gathering)) return false;
  const gathering = value.gathering;
  return ["idle", "redemption", "auction", "complete"].includes(String(gathering.phase)) &&
    record(gathering.redemptions) && integer(gathering.auctionRound, 1) &&
    Array.isArray(gathering.auctionResults);
}

function matchState(value: unknown): value is MatchState {
  return record(value) && exactKeys(value, ["game", "guild", "lastDice"], ["pendingPlayerTrade"]) &&
    gameState(value.game) && guildState(value.guild) &&
    (value.lastDice === null || record(value.lastDice));
}

function pendingAuction(value: unknown): boolean {
  return record(value) && exactKeys(value, ["round", "bidsBySeatId"]) &&
    integer(value.round, 1) && record(value.bidsBySeatId) &&
    Object.values(value.bidsBySeatId).every((bid) => integer(bid));
}

function lockedMatchIsConsistent(room: PersistedRoom, seats: PersistedSeat[]): boolean {
  const match = room.matchState;
  if (!matchState(match) || match.game.players.length !== seats.length) return false;
  if (room.lifecycle === "playing" && match.game.phase === "gameOver") return false;
  if (room.lifecycle === "finished" && match.game.phase !== "gameOver") return false;
  return seats.every((seat, index) =>
    seat.playerId === match.game.players[index].id &&
    seat.nickname === match.game.players[index].name
  );
}

function pendingAuctionIsConsistent(room: PersistedRoom, seats: PersistedSeat[]): boolean {
  const auction = room.pendingAuction;
  if (auction === undefined) return true;
  const match = room.matchState;
  if (room.lifecycle !== "playing" || !matchState(match) ||
    match.guild.gathering.phase !== "auction" ||
    auction.round !== match.guild.gathering.auctionRound) return false;

  return Object.entries(auction.bidsBySeatId).every(([seatId, bid]) => {
    const playerId = seats.find((seat) => seat.seatId === seatId)?.playerId;
    const lockedPlayer = match.game.players.find((player) => player.id === playerId);
    return lockedPlayer !== undefined && bid <= lockedPlayer.guildTokens;
  });
}

export function assertPersistedRoom(value: unknown): asserts value is PersistedRoom {
  if (!record(value) || !exactKeys(value, [
    "schemaVersion", "roomCode", "lifecycle", "createdAt", "lastActivityAt", "expiresAt",
    "hostSeatId", "nextJoinOrder", "roomVersion", "seats", "connectionTickets"
  ], ["matchState", "pendingAuction"]) ||
    value.schemaVersion !== 1 || typeof value.roomCode !== "string" ||
    !/^[A-HJ-NP-Z2-9]{6}$/.test(value.roomCode) ||
    !["lobby", "playing", "finished"].includes(String(value.lifecycle)) ||
    !integer(value.createdAt) || !integer(value.lastActivityAt) || !integer(value.expiresAt) ||
    value.expiresAt !== value.lastActivityAt + 86_400_000 ||
    typeof value.hostSeatId !== "string" || !integer(value.nextJoinOrder, 2) ||
    !integer(value.roomVersion, 1) || !Array.isArray(value.seats) || !value.seats.every(seat) ||
    !Array.isArray(value.connectionTickets) || !value.connectionTickets.every(ticket) ||
    (value.pendingAuction !== undefined && !pendingAuction(value.pendingAuction))) {
    throw new RoomSchemaError();
  }

  const seats = value.seats as PersistedSeat[];
  const seatIds = new Set(seats.map((item) => item.seatId));
  const orders = new Set(seats.map((item) => item.joinOrder));
  const nicknames = new Set(seats.map((item) => item.normalizedNickname));
  const room = value as unknown as PersistedRoom;
  const players = seats.flatMap((item) => item.playerId === undefined ? [] : [item.playerId]);
  const lobby = value.lifecycle === "lobby";
  const countValid = lobby ? seats.length >= 1 && seats.length <= 4 : seats.length >= 3 && seats.length <= 4;
  const stateValid = lobby
    ? value.matchState === undefined && players.length === 0
    : players.length === seats.length && new Set(players).size === players.length &&
      lockedMatchIsConsistent(room, seats);
  const referencesValid = seatIds.has(value.hostSeatId) &&
    value.connectionTickets.every((item) => seatIds.has(item.seatId)) &&
    pendingAuctionIsConsistent(room, seats);
  const orderValid = orders.size === seats.length &&
    value.nextJoinOrder > Math.max(...seats.map((item) => item.joinOrder));

  if (!countValid || !stateValid || !referencesValid || !orderValid ||
    seatIds.size !== seats.length || nicknames.size !== seats.length) {
    throw new RoomSchemaError();
  }
}

function expiredAt(value: unknown): number | undefined {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "expiredAt"]) ||
    value.schemaVersion !== 1 || !integer(value.expiredAt)) {
    return undefined;
  }
  return value.expiredAt;
}

async function readStoredRoom(
  storage: RoomStorage,
  now: number
): Promise<RoomLookup> {
  const value = await storage.get(ROOM_RECORD_KEY);
  const tombstone = await storage.get(ROOM_EXPIRED_KEY);
  if (value !== undefined && tombstone !== undefined) throw new RoomSchemaError();
  if (value === undefined) {
    if (tombstone === undefined) return { kind: "missing" };
    const timestamp = expiredAt(tombstone);
    if (timestamp === undefined) throw new RoomSchemaError();
    return { kind: "expired", expiredAt: timestamp };
  }

  assertPersistedRoom(value);
  const connectionTickets = value.connectionTickets.filter((item) => item.expiresAt > now);
  if (connectionTickets.length === value.connectionTickets.length) {
    return { kind: "active", room: value };
  }
  const cleaned = { ...value, connectionTickets };
  await storage.put(ROOM_RECORD_KEY, cleaned);
  return { kind: "active", room: cleaned };
}

export class RoomStore {
  constructor(private readonly storage: RoomStorage) {}

  lookup(now: number): Promise<RoomLookup> {
    return readStoredRoom(this.storage, now);
  }

  async load(now: number): Promise<PersistedRoom | null> {
    const result = await this.lookup(now);
    return result.kind === "active" ? result.room : null;
  }

  async createIfEmpty(room: PersistedRoom): Promise<"created" | "collision"> {
    assertPersistedRoom(room);
    return this.transaction(async (storage) => {
      if ((await readStoredRoom(storage, room.createdAt)).kind !== "missing") {
        return "collision";
      }
      await storage.put(ROOM_RECORD_KEY, room);
      await storage.setAlarm(room.expiresAt);
      return "created";
    });
  }

  async save(room: PersistedRoom): Promise<void> {
    assertPersistedRoom(room);
    await this.storage.put(ROOM_RECORD_KEY, room);
    await this.storage.setAlarm(room.expiresAt);
  }

  async delete(): Promise<void> {
    await this.storage.delete(ROOM_RECORD_KEY);
    await this.storage.delete(ROOM_EXPIRED_KEY);
    await this.storage.deleteAlarm();
  }

  async expire(expiredAt: number): Promise<void> {
    await this.transaction(async (storage) => {
      await storage.delete(ROOM_RECORD_KEY);
      await storage.put(ROOM_EXPIRED_KEY, { schemaVersion: 1, expiredAt });
      await storage.deleteAlarm();
    });
  }

  async deferExpiry(until: number): Promise<void> {
    await this.storage.setAlarm(until);
  }

  private transaction<T>(closure: (storage: RoomStorage) => Promise<T>): Promise<T> {
    return this.storage.transaction ? this.storage.transaction(closure) : closure(this.storage);
  }

  async joinLatest(
    input: NewSeatInput,
    now: number
  ): Promise<PersistedRoom | "missing" | "expired"> {
    return this.transaction(async (storage) => {
      const current = await readStoredRoom(storage, now);
      if (current.kind !== "active") return current.kind;
      const room = joinLobby(current.room, input, now);
      await storage.put(ROOM_RECORD_KEY, room);
      await storage.setAlarm(room.expiresAt);
      return room;
    });
  }

  async leaveLatest(
    seatId: string,
    tokenHash: string,
    connectedSeatIds: readonly string[],
    now: number
  ): Promise<"missing" | "expired" | "invalid-token" | "deleted" | { room: PersistedRoom }> {
    return this.transaction(async (storage) => {
      const current = await readStoredRoom(storage, now);
      if (current.kind !== "active") return current.kind;
      const seat = current.room.seats.find((candidate) =>
        candidate.seatId === seatId && hashesMatch(candidate.tokenHash, tokenHash)
      );
      if (seat === undefined) return "invalid-token";
      const result = leaveLobby(current.room, seatId, connectedSeatIds, now);
      if (result.kind === "deleted") {
        await storage.delete(ROOM_RECORD_KEY);
        await storage.deleteAlarm();
        return "deleted";
      }
      await storage.put(ROOM_RECORD_KEY, result.room);
      await storage.setAlarm(result.room.expiresAt);
      return { room: result.room };
    });
  }

  async issueTicketLatest(
    tokenHash: string,
    ticket: Omit<ConnectionTicket, "seatId">,
    now: number
  ): Promise<"missing" | "expired" | "invalid-token" | { room: PersistedRoom; seatId: string }> {
    return this.transaction(async (storage) => {
      const current = await readStoredRoom(storage, now);
      if (current.kind !== "active") return current.kind;
      const value = current.room;
      const seat = value.seats.find((candidate) => hashesMatch(candidate.tokenHash, tokenHash));
      if (seat === undefined) return "invalid-token";
      const validTickets = value.connectionTickets.filter((candidate) => candidate.expiresAt > now);
      const room = {
        ...value,
        connectionTickets: [...validTickets, { ...ticket, seatId: seat.seatId }]
      };
      assertPersistedRoom(room);
      await storage.put(ROOM_RECORD_KEY, room);
      await storage.setAlarm(room.expiresAt);
      return { room, seatId: seat.seatId };
    });
  }

  async consumeConnectionTicket(
    ticketHash: string,
    now: number
  ): Promise<"missing" | "expired" | "invalid-ticket" | { room: PersistedRoom; seatId: string }> {
    const consume = async (storage: RoomStorage) => {
      const current = await readStoredRoom(storage, now);
      if (current.kind !== "active") return current.kind;
      const value = current.room;
      const validTickets = value.connectionTickets.filter((ticket) => ticket.expiresAt > now);
      const ticket = validTickets.find((candidate) => hashesMatch(candidate.ticketHash, ticketHash));
      if (ticket === undefined) {
        if (validTickets.length !== value.connectionTickets.length) {
          await storage.put(ROOM_RECORD_KEY, { ...value, connectionTickets: validTickets });
        }
        return "invalid-ticket" as const;
      }
      const room = refreshRoomActivity({
        ...value,
        connectionTickets: validTickets.filter((candidate) => candidate !== ticket)
      }, now);
      assertPersistedRoom(room);
      await storage.put(ROOM_RECORD_KEY, room);
      await storage.setAlarm(room.expiresAt);
      return { room, seatId: ticket.seatId };
    };
    return this.transaction(consume);
  }
}
