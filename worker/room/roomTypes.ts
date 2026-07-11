import type { MatchState } from "../../src/domain/match/types";
import type { PlayerId } from "../../src/domain/types";

export type PersistedRoomLifecycle = "lobby" | "playing" | "finished";

export interface AcceptedCommand {
  commandId: string;
  resultingVersion: number;
}

export interface PersistedSeat {
  seatId: string;
  playerId?: PlayerId;
  nickname: string;
  normalizedNickname: string;
  tokenHash: string;
  joinedAt: number;
  joinOrder: number;
  ready: boolean;
  acceptedCommandIds: AcceptedCommand[];
  commandAttemptTimestamps: number[];
}

export interface ConnectionTicket {
  ticketHash: string;
  seatId: string;
  expiresAt: number;
}

export interface PendingSealedAuction {
  round: number;
  bidsBySeatId: Record<string, number>;
}

export interface PersistedRoom {
  schemaVersion: 1;
  roomCode: string;
  lifecycle: PersistedRoomLifecycle;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  hostSeatId: string;
  nextJoinOrder: number;
  roomVersion: number;
  seats: PersistedSeat[];
  matchState?: MatchState;
  connectionTickets: ConnectionTicket[];
  pendingAuction?: PendingSealedAuction;
}
