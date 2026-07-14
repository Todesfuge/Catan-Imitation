import { RuleViolationError } from "../../src/domain/errors";
import { applyMatchCommand } from "../../src/domain/match/applyMatchCommand";
import type { MatchCommand, MatchExecutionContext, MatchState } from "../../src/domain/match/types";
import {
  ERROR_DEFINITIONS,
  PROTOCOL_SCHEMA_VERSION,
  ProtocolValidationError,
  parseClientWebSocketMessage,
  type ClientWebSocketMessage,
  type OnlineMatchCommand,
  type PresenceEntry,
  type ProtocolErrorCode,
  type RoomSnapshotMessage,
  type ServerWebSocketMessage
} from "../../src/online/protocol";
import { projectRoomView } from "../../src/online/projectRoomView";
import type { OnlineAvailabilityContext } from "../../src/online/allowedActions";
import {
  hashSecret,
  prepareBufferedCryptoRandomSource,
  prepareCryptographicM1MapSeed
} from "../crypto";
import { RoomLifecycleError, restartRoom, setLobbyReady, startLobby } from "./roomLifecycle";
import { createRestartAttemptLimiter } from "./restartAttemptLimiter";
import type { LatestRoomMutation, LatestRoomMutationResult } from "./roomStore";
import type { PersistedRoom, PersistedSeat } from "./roomTypes";

const ROOM_RETENTION_MS = 86_400_000;
const ACCEPTED_COMMAND_LIMIT = 64;

export type { LatestRoomMutation } from "./roomStore";

export interface CommandMutationStore {
  mutateLatest<T>(
    now: number,
    mutation: (room: PersistedRoom) => LatestRoomMutation<T>
  ): Promise<LatestRoomMutationResult<T>>;
}

export interface CommandRecipient {
  seatId: string;
  send(message: ServerWebSocketMessage): void;
  close?(code: number, reason: string): void;
}

export interface CommandPipelineInput {
  seatId: string;
  rawMessage: string;
  now: number;
  presence: PresenceEntry[];
  recipients: readonly CommandRecipient[];
}

interface PipelineDependencies {
  store: CommandMutationStore;
  createExecutionContext?: (now: number) => MatchExecutionContext;
  prepareExecutionContext?: (now: number) => () => MatchExecutionContext;
  prepareExecutionContextForRoom?: (now: number) => (roomVersion: number) => MatchExecutionContext;
  executeMatchCommand?: (
    state: MatchState,
    command: MatchCommand,
    context: MatchExecutionContext
  ) => MatchState;
  projectRoom?: (
    room: PersistedRoom,
    seatId: string,
    context: OnlineAvailabilityContext
  ) => ReturnType<typeof projectRoomView>;
  rateLimit?: { maximum: number; windowMs: number };
  audit?: (record: CommandAuditRecord) => void;
}

export interface CommandAuditRecord {
  event: "room.command";
  roomHashPrefix: string;
  commandType: string;
  roomVersion: number;
  durationMs: number;
  errorCode?: ProtocolErrorCode;
}

type MutationOutcome =
  | { kind: "accepted"; commandId: string }
  | { kind: "duplicate"; commandId: string }
  | { kind: "rejected"; commandId: string; code: ProtocolErrorCode; includeSnapshot?: boolean }
  | { kind: "protocol" }
  | { kind: "heartbeat" };

function error(code: ProtocolErrorCode) {
  return { code, params: {}, retryable: ERROR_DEFINITIONS[code].retryable };
}

function snapshot(
  room: PersistedRoom,
  seatId: string,
  presence: PresenceEntry[],
  acknowledgedCommandId: string | undefined,
  project: NonNullable<PipelineDependencies["projectRoom"]>
): RoomSnapshotMessage {
  const observedCounts = new Map(presence.map((entry) => [entry.seatId, entry.connectionCount]));
  const roomPresence = [...room.seats]
    .sort((left, right) => left.joinOrder - right.joinOrder)
    .map((seat) => {
      const connectionCount = observedCounts.get(seat.seatId) ?? 0;
      return { seatId: seat.seatId, connectionCount, online: connectionCount > 0 };
    });
  const projected = project(room, seatId, {
    connectedSeatIds: roomPresence.filter((entry) => entry.online).map((entry) => entry.seatId)
  });
  return {
    type: "room.snapshot",
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    roomVersion: room.roomVersion,
    lifecycle: room.lifecycle,
    publicState: projected.publicState as unknown as Record<string, unknown>,
    privateState: projected.privateState as unknown as Record<string, unknown>,
    allowedActions: (projected.allowedActions ?? {}) as unknown as Record<string, unknown>,
    presence: roomPresence,
    ...(acknowledgedCommandId === undefined ? {} : { acknowledgedCommandId })
  };
}

function trustedCommand(command: OnlineMatchCommand, playerId: string): MatchCommand {
  switch (command.type) {
    case "START_GATHERING":
      return { ...command, playerId };
    case "OPEN_AUCTION":
      return command;
    case "TRANSFER_TOKENS":
      return { ...command, fromPlayerId: playerId };
    default:
      return { ...command, playerId } as MatchCommand;
  }
}

function recordAccepted(room: PersistedRoom, seatId: string, commandId: string): PersistedRoom {
  return {
    ...room,
    seats: room.seats.map((seat) => seat.seatId === seatId
      ? {
          ...seat,
          acceptedCommandIds: [
            ...seat.acceptedCommandIds,
            { commandId, resultingVersion: room.roomVersion }
          ].slice(-ACCEPTED_COMMAND_LIMIT)
        }
      : seat)
  };
}

function acceptedMatchRoom(
  room: PersistedRoom,
  seat: PersistedSeat,
  message: Extract<ClientWebSocketMessage, { type: "match.command" }>,
  context: MatchExecutionContext,
  execute: NonNullable<PipelineDependencies["executeMatchCommand"]>,
  now: number
): PersistedRoom {
  if (room.lifecycle !== "playing" || room.matchState === undefined || seat.playerId === undefined) {
    throw new RoomLifecycleError("ROOM_ALREADY_STARTED");
  }
  const matchState = execute(room.matchState, trustedCommand(message.command, seat.playerId), context);
  const nextRoom: PersistedRoom = {
    ...room,
    lifecycle: matchState.game.phase === "gameOver" ? "finished" : "playing",
    matchState,
    roomVersion: room.roomVersion + 1,
    lastActivityAt: now,
    expiresAt: now + ROOM_RETENTION_MS
  };
  if (matchState.guild.gathering.phase === "auction") {
    const round = matchState.guild.gathering.auctionRound;
    return {
      ...nextRoom,
      pendingAuction: room.pendingAuction?.round === round
        ? room.pendingAuction
        : { round, bidsBySeatId: {} }
    };
  }
  const { pendingAuction: _clearedAuction, ...withoutPendingAuction } = nextRoom;
  return withoutPendingAuction;
}

function acceptedAuctionRoom(
  room: PersistedRoom,
  seat: PersistedSeat,
  message: Extract<ClientWebSocketMessage, { type: "auction.submitBid" }>,
  context: MatchExecutionContext,
  execute: NonNullable<PipelineDependencies["executeMatchCommand"]>,
  now: number
): PersistedRoom {
  const match = room.matchState;
  if (
    room.lifecycle !== "playing" ||
    match === undefined ||
    seat.playerId === undefined ||
    match.guild.gathering.phase !== "auction"
  ) {
    throw new RoomLifecycleError("ROOM_ALREADY_STARTED");
  }
  const player = match.game.players.find((candidate) => candidate.id === seat.playerId);
  if (player === undefined) throw new RoomLifecycleError("ROOM_ALREADY_STARTED");
  if (message.amount > player.guildTokens) {
    throw new RuleViolationError("Auction bid exceeds available guild tokens.");
  }

  const round = match.guild.gathering.auctionRound;
  const currentBids = room.pendingAuction?.round === round
    ? room.pendingAuction.bidsBySeatId
    : {};
  const bidsBySeatId = { ...currentBids, [seat.seatId]: message.amount };
  const allSubmitted = room.seats.every((lockedSeat) =>
    Object.hasOwn(bidsBySeatId, lockedSeat.seatId)
  );
  if (!allSubmitted) {
    return {
      ...room,
      pendingAuction: { round, bidsBySeatId },
      roomVersion: room.roomVersion + 1,
      lastActivityAt: now,
      expiresAt: now + ROOM_RETENTION_MS
    };
  }

  const bids = Object.fromEntries(room.seats.map((lockedSeat) => {
    if (lockedSeat.playerId === undefined) throw new RoomLifecycleError("ROOM_ALREADY_STARTED");
    return [lockedSeat.playerId, bidsBySeatId[lockedSeat.seatId]];
  }));
  const { pendingAuction: _clearedSecret, ...clearedRoom } = room;
  const resolved = execute(match, { type: "RESOLVE_AUCTION", bids }, context);
  const nextRoom: PersistedRoom = {
    ...clearedRoom,
    lifecycle: resolved.game.phase === "gameOver" ? "finished" : "playing",
    matchState: resolved,
    roomVersion: room.roomVersion + 1,
    lastActivityAt: now,
    expiresAt: now + ROOM_RETENTION_MS
  };
  return resolved.guild.gathering.phase === "auction"
    ? {
        ...nextRoom,
        pendingAuction: {
          round: resolved.guild.gathering.auctionRound,
          bidsBySeatId: {}
        }
      }
    : nextRoom;
}

function executeMessage(
  room: PersistedRoom,
  seat: PersistedSeat,
  message: Exclude<ClientWebSocketMessage, { type: "connection.heartbeat" }>,
  context: MatchExecutionContext,
  execute: NonNullable<PipelineDependencies["executeMatchCommand"]>,
  now: number
): PersistedRoom {
  switch (message.type) {
    case "room.ready":
      return setLobbyReady(room, seat.seatId, message.ready, now);
    case "room.start":
      return startLobby(room, seat.seatId, context, now);
    case "room.restart":
      return restartRoom(room, seat.seatId, message.mode, context, now);
    case "match.command":
      return acceptedMatchRoom(room, seat, message, context, execute, now);
    case "auction.submitBid":
      return acceptedAuctionRoom(room, seat, message, context, execute, now);
  }
}

function safeSend(recipient: CommandRecipient, message: ServerWebSocketMessage): void {
  try {
    recipient.send(message);
  } catch {
    // One disconnected tab must not prevent delivery to other authenticated seats.
  }
}

function safeClose(recipient: CommandRecipient, code: number, reason: string): void {
  try {
    recipient.close?.(code, reason);
  } catch {
    // Continue terminal cleanup for every remaining peer.
  }
}

function expireRoom(recipients: readonly CommandRecipient[]): void {
  const message: ServerWebSocketMessage = {
    type: "room.expired",
    error: error("ROOM_EXPIRED")
  };
  for (const recipient of recipients) {
    safeSend(recipient, message);
    safeClose(recipient, 4002, "ROOM_EXPIRED");
  }
}

function withAttemptTimestamps(
  room: PersistedRoom,
  seatId: string,
  timestamps: readonly number[]
): PersistedRoom {
  return {
    ...room,
    seats: room.seats.map((seat) => seat.seatId === seatId
      ? { ...seat, commandAttemptTimestamps: [...timestamps].slice(-10) }
      : seat)
  };
}

function rejectionCode(caught: unknown): ProtocolErrorCode {
  return caught instanceof RuleViolationError ? "RULE_VIOLATION"
    : caught instanceof RoomLifecycleError ? "COMMAND_NOT_ALLOWED"
      : "INTERNAL_ERROR";
}

export function createCommandPipeline(dependencies: PipelineDependencies) {
  const execute = dependencies.executeMatchCommand ?? applyMatchCommand;
  const project = dependencies.projectRoom ?? projectRoomView;
  const rateLimit = dependencies.rateLimit ?? { maximum: 10, windowMs: 2_000 };
  const audit = dependencies.audit ?? ((record: CommandAuditRecord) => console.log(record));
  const restartAttemptLimiter = createRestartAttemptLimiter(rateLimit);

  async function emitAudit(
    roomCode: string,
    roomVersion: number,
    commandType: string,
    startedAt: number,
    errorCode?: ProtocolErrorCode
  ): Promise<void> {
    try {
      audit({
        event: "room.command",
        roomHashPrefix: (await hashSecret(roomCode)).slice(0, 12),
        commandType,
        roomVersion,
        durationMs: Math.max(0, performance.now() - startedAt),
        ...(errorCode === undefined ? {} : { errorCode })
      });
    } catch {
      // Observability must never change command delivery or persisted room state.
    }
  }

  return {
    async handle(input: CommandPipelineInput): Promise<void> {
      let parsed: ClientWebSocketMessage;
      try {
        parsed = parseClientWebSocketMessage(input.rawMessage);
      } catch (caught) {
        if (!(caught instanceof ProtocolValidationError)) throw caught;
        for (const recipient of input.recipients) {
          if (recipient.seatId === input.seatId) {
            safeSend(recipient, {
              type: "protocol.incompatible",
              error: { ...error("PROTOCOL_INCOMPATIBLE"), params: { expected: PROTOCOL_SCHEMA_VERSION } }
            });
            safeClose(recipient, 4004, "PROTOCOL_INCOMPATIBLE");
          }
        }
        return;
      }

      const authenticated = await dependencies.store.mutateLatest(input.now, (room) => ({
        kind: "unchanged",
        value: {
          authorized: room.seats.some((seat) => seat.seatId === input.seatId),
          roomCode: room.roomCode,
          roomVersion: room.roomVersion
        }
      }));
      if (authenticated.kind === "expired") {
        expireRoom(input.recipients);
        return;
      }
      const authenticationError: ProtocolErrorCode | undefined =
        authenticated.kind === "missing" ? "ROOM_NOT_FOUND"
          : !authenticated.value.authorized ? "COMMAND_NOT_ALLOWED" : undefined;

      if (authenticationError !== undefined) {
        for (const recipient of input.recipients) {
          if (recipient.seatId !== input.seatId) continue;
          if (parsed.type === "connection.heartbeat") {
            safeSend(recipient, {
              type: "protocol.incompatible",
              error: { ...error("PROTOCOL_INCOMPATIBLE"), params: { expected: PROTOCOL_SCHEMA_VERSION } }
            });
            safeClose(recipient, 4004, "PROTOCOL_INCOMPATIBLE");
          } else {
            safeSend(recipient, {
              type: "command.rejected", commandId: parsed.commandId, error: error(authenticationError)
            });
          }
        }
        return;
      }
      if (parsed.type === "connection.heartbeat") return;
      const auditStartedAt = performance.now();
      const commandType = parsed.type === "match.command" ? parsed.command.type : parsed.type;
      let preparedContext: () => MatchExecutionContext;
      let contextForRoomVersion: ((roomVersion: number) => MatchExecutionContext) | undefined;
      try {
        const prepareRandom = prepareBufferedCryptoRandomSource();
        const preparedMapSeed = prepareCryptographicM1MapSeed();
        const logIds = Array.from({ length: 128 }, () => crypto.randomUUID());
        preparedContext = dependencies.prepareExecutionContext?.(input.now) ?? (() => {
          if (dependencies.createExecutionContext !== undefined) {
            return dependencies.createExecutionContext(input.now);
          }
          let logIndex = 0;
          return {
            random: prepareRandom(),
            nextMapSeed: () => preparedMapSeed,
            nextLogId: () => {
              const id = logIds[logIndex++];
              if (id === undefined) throw new RangeError("The buffered log ID source is exhausted.");
              return id;
            },
            now: () => input.now
          };
        });
        contextForRoomVersion = dependencies.prepareExecutionContextForRoom?.(input.now);
      } catch {
        if (authenticated.kind === "active") {
          await emitAudit(
            authenticated.value.roomCode,
            authenticated.value.roomVersion,
            commandType,
            auditStartedAt,
            "INTERNAL_ERROR"
          );
        }
        for (const recipient of input.recipients) {
          if (recipient.seatId === input.seatId) {
            safeSend(recipient, {
              type: "command.rejected",
              commandId: parsed.commandId,
              error: error("INTERNAL_ERROR")
            });
          }
        }
        return;
      }
      let restartRateDecision: ReturnType<typeof restartAttemptLimiter.assess> | undefined;

      let mutation: LatestRoomMutationResult<MutationOutcome>;
      try {
        mutation = await dependencies.store.mutateLatest<MutationOutcome>(input.now, (room) => {
          const seat = room.seats.find((candidate) => candidate.seatId === input.seatId);
          if (seat === undefined) {
            return {
              kind: "unchanged",
              value: { kind: "rejected", commandId: parsed.commandId, code: "COMMAND_NOT_ALLOWED" }
            };
          }
          if (seat.acceptedCommandIds.some((entry) => entry.commandId === parsed.commandId)) {
            return { kind: "unchanged", value: { kind: "duplicate", commandId: parsed.commandId } };
          }
          const restart = parsed.type === "room.restart";
          const rateDecision = restart
            ? (restartRateDecision ??= restartAttemptLimiter.assess({
                roomCode: room.roomCode,
                currentSeatIds: room.seats.map((candidate) => candidate.seatId),
                seatId: seat.seatId,
                persistedAttemptTimestamps: seat.commandAttemptTimestamps,
                now: input.now,
                recordRestartAttempt: true
              }))
            : restartAttemptLimiter.assess({
                roomCode: room.roomCode,
                currentSeatIds: room.seats.map((candidate) => candidate.seatId),
                seatId: seat.seatId,
                persistedAttemptTimestamps: seat.commandAttemptTimestamps,
                now: input.now,
                recordRestartAttempt: false
              });
          if (rateDecision.limited) {
            return {
              kind: "unchanged",
              value: { kind: "rejected", commandId: parsed.commandId, code: "RATE_LIMITED" }
            };
          }
          const admittedRoom = restart
            ? room
            : withAttemptTimestamps(
                room,
                seat.seatId,
                [...rateDecision.recentPersistedAttemptTimestamps, input.now]
                  .sort((left, right) => left - right)
              );
          if (parsed.expectedVersion !== room.roomVersion) {
            return {
              kind: "unchanged",
              value: {
                kind: "rejected", commandId: parsed.commandId,
                code: "VERSION_CONFLICT", includeSnapshot: true
              }
            };
          }

          try {
            const next = recordAccepted(
              executeMessage(
                admittedRoom,
                seat,
                parsed,
                contextForRoomVersion?.(room.roomVersion) ?? preparedContext(),
                execute,
                input.now
              ),
              seat.seatId,
              parsed.commandId
            );
            // Projection is pure. Preflight every live seat before the transaction
            // commits so a projection regression cannot persist an unbroadcastable transition.
            for (const recipientSeatId of new Set(input.recipients.map((recipient) => recipient.seatId))) {
              if (!next.seats.some((candidate) => candidate.seatId === recipientSeatId)) continue;
              snapshot(next, recipientSeatId, input.presence, parsed.commandId, project);
            }
            return { kind: "updated", room: next, value: { kind: "accepted", commandId: parsed.commandId } };
          } catch (caught) {
            const rejected = {
              kind: "rejected" as const,
              commandId: parsed.commandId,
              code: rejectionCode(caught)
            };
            return { kind: "unchanged", value: rejected };
          }
        });
      } catch (caught) {
        const code = rejectionCode(caught);
        if (authenticated.kind === "active") {
          await emitAudit(
            authenticated.value.roomCode,
            authenticated.value.roomVersion,
            commandType,
            auditStartedAt,
            code
          );
        }
        for (const recipient of input.recipients) {
          if (recipient.seatId === input.seatId) {
            safeSend(recipient, {
              type: "command.rejected", commandId: parsed.commandId, error: error(code)
            });
          }
        }
        return;
      }

      if (mutation.kind === "missing" || mutation.kind === "expired") {
        if (mutation.kind === "expired") {
          expireRoom(input.recipients);
          return;
        }
        for (const recipient of input.recipients) {
          if (recipient.seatId === input.seatId) {
            safeSend(recipient, { type: "command.rejected", commandId: parsed.commandId, error: error("ROOM_NOT_FOUND") });
          }
        }
        return;
      }

      const outcome = mutation.value;
      await emitAudit(
        mutation.room.roomCode,
        mutation.room.roomVersion,
        commandType,
        auditStartedAt,
        outcome.kind === "rejected" ? outcome.code : undefined
      );
      if (outcome.kind === "accepted") {
        for (const recipient of input.recipients) {
          if (!mutation.room.seats.some((seat) => seat.seatId === recipient.seatId)) continue;
          safeSend(recipient, snapshot(mutation.room, recipient.seatId, input.presence, outcome.commandId, project));
        }
        return;
      }
      if (outcome.kind === "duplicate") {
        for (const recipient of input.recipients) {
          if (recipient.seatId === input.seatId) {
            safeSend(recipient, snapshot(mutation.room, recipient.seatId, input.presence, outcome.commandId, project));
          }
        }
        return;
      }
      if (outcome.kind === "rejected") {
        for (const recipient of input.recipients) {
          if (recipient.seatId !== input.seatId) continue;
          safeSend(recipient, {
            type: "command.rejected",
            commandId: outcome.commandId,
            error: error(outcome.code),
            ...(outcome.includeSnapshot
              ? { snapshot: snapshot(mutation.room, recipient.seatId, input.presence, undefined, project) as unknown as Record<string, unknown> }
              : {})
          });
        }
      }
    }
  };
}
