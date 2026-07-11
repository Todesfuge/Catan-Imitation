import type { ConnectionTicket, PersistedRoom, PersistedSeat } from "./roomTypes";

export const ROOM_RECORD_KEY = "room";

export interface RoomStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean | void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
}

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

function matchState(value: unknown): boolean {
  return record(value) && exactKeys(value, ["game", "guild", "lastDice"], ["pendingPlayerTrade"]) &&
    record(value.game) && record(value.guild) && (value.lastDice === null || record(value.lastDice));
}

function pendingAuction(value: unknown): boolean {
  return record(value) && exactKeys(value, ["round", "bidsBySeatId"]) &&
    integer(value.round, 1) && record(value.bidsBySeatId) &&
    Object.values(value.bidsBySeatId).every((bid) => integer(bid));
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
  const players = seats.flatMap((item) => item.playerId === undefined ? [] : [item.playerId]);
  const auction = value.pendingAuction as PersistedRoom["pendingAuction"];
  const lobby = value.lifecycle === "lobby";
  const countValid = lobby ? seats.length >= 1 && seats.length <= 4 : seats.length >= 3 && seats.length <= 4;
  const stateValid = lobby
    ? value.matchState === undefined && players.length === 0
    : matchState(value.matchState) && players.length === seats.length && new Set(players).size === players.length;
  const referencesValid = seatIds.has(value.hostSeatId) &&
    value.connectionTickets.every((item) => seatIds.has(item.seatId)) &&
    (auction === undefined || (value.lifecycle === "playing" &&
      Object.keys(auction.bidsBySeatId).every((seatId) => seatIds.has(seatId))));
  const orderValid = orders.size === seats.length &&
    value.nextJoinOrder > Math.max(...seats.map((item) => item.joinOrder));

  if (!countValid || !stateValid || !referencesValid || !orderValid ||
    seatIds.size !== seats.length || nicknames.size !== seats.length) {
    throw new RoomSchemaError();
  }
}

export class RoomStore {
  constructor(private readonly storage: RoomStorage) {}

  async load(now: number): Promise<PersistedRoom | null> {
    const value = await this.storage.get(ROOM_RECORD_KEY);
    if (value === undefined) return null;
    assertPersistedRoom(value);
    const connectionTickets = value.connectionTickets.filter((item) => item.expiresAt > now);
    if (connectionTickets.length === value.connectionTickets.length) return value;
    const cleaned = { ...value, connectionTickets };
    await this.storage.put(ROOM_RECORD_KEY, cleaned);
    return cleaned;
  }

  async createIfEmpty(room: PersistedRoom): Promise<"created" | "collision"> {
    assertPersistedRoom(room);
    if (await this.storage.get(ROOM_RECORD_KEY) !== undefined) return "collision";
    await this.storage.put(ROOM_RECORD_KEY, room);
    await this.storage.setAlarm(room.expiresAt);
    return "created";
  }

  async save(room: PersistedRoom): Promise<void> {
    assertPersistedRoom(room);
    await this.storage.put(ROOM_RECORD_KEY, room);
    await this.storage.setAlarm(room.expiresAt);
  }

  async delete(): Promise<void> {
    await this.storage.delete(ROOM_RECORD_KEY);
  }
}
