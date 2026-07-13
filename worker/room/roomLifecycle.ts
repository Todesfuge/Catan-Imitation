import { applyMatchCommand } from "../../src/domain/match/applyMatchCommand";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import type { MapRestartMode, MatchExecutionContext } from "../../src/domain/match/types";
import type { PersistedRoom, PersistedSeat } from "./roomTypes";

export const ROOM_RETENTION_MS = 86_400_000;
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type RoomLifecycleErrorCode =
  | "INVALID_ROOM_CODE"
  | "INVALID_NICKNAME"
  | "INVALID_TOKEN_HASH"
  | "ROOM_FULL"
  | "ROOM_ALREADY_STARTED"
  | "NICKNAME_TAKEN"
  | "SEAT_ALREADY_EXISTS"
  | "SEAT_NOT_FOUND"
  | "HOST_ONLY"
  | "INVALID_SEAT_COUNT"
  | "NOT_ALL_READY";

export class RoomLifecycleError extends Error {
  constructor(readonly code: RoomLifecycleErrorCode) {
    super(code);
    this.name = "RoomLifecycleError";
  }
}

export type RandomBytesSource = (target: Uint8Array) => void;

export function generateRoomCode(
  randomBytes: RandomBytesSource = (target) => crypto.getRandomValues(target)
): string {
  const bytes = new Uint8Array(6);
  randomBytes(bytes);
  return [...bytes].map((byte) => ROOM_CODE_ALPHABET[byte & 31]).join("");
}

export function normalizeRoomCode(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z2-9]{6}$/.test(trimmed)) {
    throw new RoomLifecycleError("INVALID_ROOM_CODE");
  }
  const code = trimmed.toUpperCase();
  if ([...code].some((character) => !ROOM_CODE_ALPHABET.includes(character))) {
    throw new RoomLifecycleError("INVALID_ROOM_CODE");
  }
  return code;
}

export interface NormalizedNickname {
  nickname: string;
  normalizedNickname: string;
}

export function normalizeNickname(value: string): NormalizedNickname {
  const nickname = value.normalize("NFKC").trim();
  const length = [...nickname].length;
  if (length === 0 || length > 20) throw new RoomLifecycleError("INVALID_NICKNAME");
  return { nickname, normalizedNickname: nickname.toLocaleLowerCase() };
}

export interface NewSeatInput {
  seatId: string;
  nickname: string;
  tokenHash: string;
}

function requireLobby(room: PersistedRoom): void {
  if (room.lifecycle !== "lobby") throw new RoomLifecycleError("ROOM_ALREADY_STARTED");
}

function makeSeat(input: NewSeatInput, joinedAt: number, joinOrder: number): PersistedSeat {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.tokenHash)) {
    throw new RoomLifecycleError("INVALID_TOKEN_HASH");
  }
  return {
    seatId: input.seatId,
    ...normalizeNickname(input.nickname),
    tokenHash: input.tokenHash,
    joinedAt,
    joinOrder,
    ready: false,
    acceptedCommandIds: [],
    commandAttemptTimestamps: []
  };
}

function acceptedActivity(room: PersistedRoom, now: number): PersistedRoom {
  return {
    ...room,
    roomVersion: room.roomVersion + 1,
    lastActivityAt: now,
    expiresAt: now + ROOM_RETENTION_MS
  };
}

export function createLobby(
  input: NewSeatInput & { roomCode: string },
  now: number
): PersistedRoom {
  const host = makeSeat(input, now, 1);
  return {
    schemaVersion: 2,
    roomCode: normalizeRoomCode(input.roomCode),
    lifecycle: "lobby",
    createdAt: now,
    lastActivityAt: now,
    expiresAt: now + ROOM_RETENTION_MS,
    hostSeatId: host.seatId,
    nextJoinOrder: 2,
    roomVersion: 1,
    seats: [host],
    connectionTickets: []
  };
}

export function joinLobby(room: PersistedRoom, input: NewSeatInput, now: number): PersistedRoom {
  requireLobby(room);
  if (room.seats.length === 4) throw new RoomLifecycleError("ROOM_FULL");
  if (room.seats.some((seat) => seat.seatId === input.seatId)) {
    throw new RoomLifecycleError("SEAT_ALREADY_EXISTS");
  }
  const seat = makeSeat(input, now, room.nextJoinOrder);
  if (room.seats.some((existing) => existing.normalizedNickname === seat.normalizedNickname)) {
    throw new RoomLifecycleError("NICKNAME_TAKEN");
  }
  return acceptedActivity({
    ...room,
    seats: [...room.seats, seat],
    nextJoinOrder: room.nextJoinOrder + 1
  }, now);
}

export function setLobbyReady(
  room: PersistedRoom,
  seatId: string,
  ready: boolean,
  now: number
): PersistedRoom {
  requireLobby(room);
  if (!room.seats.some((seat) => seat.seatId === seatId)) {
    throw new RoomLifecycleError("SEAT_NOT_FOUND");
  }
  return acceptedActivity({
    ...room,
    seats: room.seats.map((seat) => seat.seatId === seatId ? { ...seat, ready } : seat)
  }, now);
}

export type LeaveLobbyResult =
  | { kind: "updated"; room: PersistedRoom }
  | { kind: "deleted" };

export function leaveLobby(
  room: PersistedRoom,
  seatId: string,
  connectedSeatIds: readonly string[],
  now: number
): LeaveLobbyResult {
  requireLobby(room);
  if (!room.seats.some((seat) => seat.seatId === seatId)) {
    throw new RoomLifecycleError("SEAT_NOT_FOUND");
  }
  const seats = room.seats.filter((seat) => seat.seatId !== seatId);
  if (seats.length === 0) return { kind: "deleted" };

  let hostSeatId = room.hostSeatId;
  if (hostSeatId === seatId) {
    const connected = new Set(connectedSeatIds);
    const candidates = [...seats].sort((left, right) => left.joinOrder - right.joinOrder);
    hostSeatId = (candidates.find((seat) => connected.has(seat.seatId)) ?? candidates[0]).seatId;
  }
  const connectionTickets = room.connectionTickets.filter((ticket) => ticket.seatId !== seatId);
  return {
    kind: "updated",
    room: acceptedActivity({ ...room, seats, hostSeatId, connectionTickets }, now)
  };
}

export function startLobby(
  room: PersistedRoom,
  requestingSeatId: string,
  context: MatchExecutionContext,
  now: number
): PersistedRoom {
  requireLobby(room);
  if (requestingSeatId !== room.hostSeatId) throw new RoomLifecycleError("HOST_ONLY");
  if (room.seats.length !== 3 && room.seats.length !== 4) {
    throw new RoomLifecycleError("INVALID_SEAT_COUNT");
  }
  if (room.seats.some((seat) => !seat.ready)) throw new RoomLifecycleError("NOT_ALL_READY");

  const seats = [...room.seats].sort((left, right) => left.joinOrder - right.joinOrder);
  const matchState = createSetupMatch(
    seats.map((seat) => ({ nickname: seat.nickname })),
    { kind: "fresh" },
    context
  );
  const lockedSeats = seats.map((seat, index) => ({
    ...seat,
    playerId: matchState.game.players[index].id
  }));
  return acceptedActivity({ ...room, lifecycle: "playing", seats: lockedSeats, matchState }, now);
}

export function restartRoom(
  room: PersistedRoom,
  requestingSeatId: string,
  mode: MapRestartMode,
  context: MatchExecutionContext,
  now: number
): PersistedRoom {
  if (!room.seats.some((seat) => seat.seatId === requestingSeatId)) {
    throw new RoomLifecycleError("SEAT_NOT_FOUND");
  }
  if (requestingSeatId !== room.hostSeatId) throw new RoomLifecycleError("HOST_ONLY");
  if (
    (room.lifecycle !== "playing" && room.lifecycle !== "finished") ||
    room.matchState === undefined
  ) {
    throw new RoomLifecycleError("ROOM_ALREADY_STARTED");
  }

  const matchState = applyMatchCommand(room.matchState, { type: "START_NEW_GAME", mode }, context);
  const { pendingAuction: _obsoleteAuction, ...withoutAuction } = room;
  return acceptedActivity({
    ...withoutAuction,
    lifecycle: "playing",
    seats: room.seats.map((seat) => ({ ...seat, acceptedCommandIds: [] })),
    matchState
  }, now);
}

export function refreshRoomActivity(room: PersistedRoom, now: number): PersistedRoom {
  return acceptedActivity(room, now);
}
