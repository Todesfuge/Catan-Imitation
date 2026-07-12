import { PROTOCOL_SCHEMA_VERSION, type PresenceEntry, type RoomSnapshotMessage } from "../../src/online/protocol";
import { projectRoomView } from "../../src/online/projectRoomView";
import { hashSecret, issueConnectionTicket, issueSeatToken } from "../crypto";
import type { Env } from "../env";
import {
  HttpProtocolError,
  jsonResponse,
  parseBearerToken,
  readJsonObject,
  safeErrorResponse
} from "../http";
import {
  RoomLifecycleError,
  createLobby,
  normalizeNickname
} from "./roomLifecycle";
import { RoomSchemaError, RoomStore } from "./roomStore";
import type { PersistedRoom } from "./roomTypes";
import { createCommandPipeline, type CommandRecipient } from "./commandPipeline";

const ROOM_RETENTION_MS = 24 * 60 * 60 * 1_000;

interface ConnectionAttachment {
  seatId: string;
  connectionId: string;
  connectedAt: number;
}

interface ActiveRoomRecipient {
  socket: WebSocket;
  attachment: ConnectionAttachment;
}

function exactNicknameBody(body: Record<string, unknown>): string {
  if (Object.keys(body).length !== 1 || typeof body.nickname !== "string") {
    throw new HttpProtocolError("RULE_VIOLATION");
  }
  try {
    return normalizeNickname(body.nickname).nickname;
  } catch {
    throw new HttpProtocolError("RULE_VIOLATION");
  }
}

function lifecycleError(error: unknown): HttpProtocolError {
  if (!(error instanceof RoomLifecycleError)) return new HttpProtocolError("INTERNAL_ERROR");
  switch (error.code) {
    case "ROOM_FULL":
      return new HttpProtocolError("ROOM_FULL");
    case "ROOM_ALREADY_STARTED":
      return new HttpProtocolError("ROOM_ALREADY_STARTED");
    case "NICKNAME_TAKEN":
    case "INVALID_NICKNAME":
    case "INVALID_ROOM_CODE":
    case "INVALID_TOKEN_HASH":
    case "SEAT_ALREADY_EXISTS":
      return new HttpProtocolError("RULE_VIOLATION");
    default:
      return new HttpProtocolError("COMMAND_NOT_ALLOWED");
  }
}

function attachment(socket: WebSocket): ConnectionAttachment | undefined {
  const value = socket.deserializeAttachment() as unknown;
  if (value === null || typeof value !== "object") return undefined;
  const candidate = value as Partial<ConnectionAttachment>;
  return Object.keys(value).length === 3 &&
    Object.hasOwn(value, "seatId") &&
    Object.hasOwn(value, "connectionId") &&
    Object.hasOwn(value, "connectedAt") &&
    typeof candidate.seatId === "string" &&
    typeof candidate.connectionId === "string" &&
    typeof candidate.connectedAt === "number" &&
    Number.isFinite(candidate.connectedAt)
    ? candidate as ConnectionAttachment
    : undefined;
}

function safeCloseSocket(socket: WebSocket, code: number, reason: string): void {
  try {
    socket.close(code, reason);
  } catch {
    // Continue cleanup or delivery for remaining peers.
  }
}

export class RoomDurableObject {
  private readonly store: RoomStore;
  private readonly commands;
  private commandTail: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: DurableObjectState, _env: Env) {
    this.store = new RoomStore(ctx.storage);
    this.commands = createCommandPipeline({ store: this.store });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch (error) {
      const safe = error instanceof HttpProtocolError
        ? error
        : error instanceof RoomSchemaError
          ? new HttpProtocolError("PROTOCOL_INCOMPATIBLE", { expected: PROTOCOL_SCHEMA_VERSION })
          : lifecycleError(error);
      return safeErrorResponse(safe);
    }
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      return this.create(request);
    }
    if (request.method === "POST" && segments.length === 4 && segments[3] === "join") {
      return this.join(request);
    }
    if (request.method === "DELETE" && segments.length === 5 && segments[3] === "seats") {
      return this.leave(request, segments[4]);
    }
    if (request.method === "POST" && segments.length === 4 && segments[3] === "connection-ticket") {
      return this.ticket(request);
    }
    if (request.method === "GET" && segments.length === 4 && segments[3] === "connect") {
      return this.upgrade(request, url);
    }
    throw new HttpProtocolError("ROOM_NOT_FOUND");
  }

  private async create(request: Request): Promise<Response> {
    const roomCode = request.headers.get("x-catan-room-code");
    if (roomCode === null) throw new HttpProtocolError("INTERNAL_ERROR");
    const nickname = exactNicknameBody(await readJsonObject(request));
    const credentials = await issueSeatToken();
    const seatId = crypto.randomUUID();
    const room = createLobby({ roomCode, seatId, nickname, tokenHash: credentials.seatTokenHash }, Date.now());
    if (await this.store.createIfEmpty(room) === "collision") {
      return jsonResponse({ collision: true }, { status: 409, headers: { "x-room-code-collision": "1" } });
    }
    return jsonResponse({ roomCode, seatId, seatToken: credentials.seatToken }, { status: 201 });
  }

  private async join(request: Request): Promise<Response> {
    const nickname = exactNicknameBody(await readJsonObject(request));
    const credentials = await issueSeatToken();
    const seatId = crypto.randomUUID();
    const updated = await this.store.joinLatest(
      { seatId, nickname, tokenHash: credentials.seatTokenHash },
      Date.now()
    );
    if (updated === "missing") throw new HttpProtocolError("ROOM_NOT_FOUND");
    if (updated === "expired") throw new HttpProtocolError("ROOM_EXPIRED");
    this.broadcastRoomState(updated);
    return jsonResponse({ roomCode: updated.roomCode, seatId, seatToken: credentials.seatToken }, { status: 201 });
  }

  private async leave(request: Request, seatId: string): Promise<Response> {
    const tokenHash = await hashSecret(parseBearerToken(request.headers));
    const room = await this.requireRoom();
    const recipients = this.activeRoomRecipients(room);
    const connectedSeatIds = recipients.map((recipient) => recipient.attachment.seatId);
    let result: Awaited<ReturnType<RoomStore["leaveLatest"]>>;
    try {
      result = await this.store.leaveLatest(seatId, tokenHash, connectedSeatIds, Date.now());
    } catch (error) {
      if (error instanceof RoomLifecycleError && error.code === "ROOM_ALREADY_STARTED") {
        throw new HttpProtocolError("COMMAND_NOT_ALLOWED");
      }
      throw error;
    }
    if (result === "missing") throw new HttpProtocolError("ROOM_NOT_FOUND");
    if (result === "expired") throw new HttpProtocolError("ROOM_EXPIRED");
    if (result === "invalid-token") throw new HttpProtocolError("SEAT_TOKEN_INVALID");
    for (const recipient of recipients) {
      if (recipient.attachment.seatId === seatId) {
        safeCloseSocket(recipient.socket, 4001, "SEAT_LEFT");
      }
    }
    if (result !== "deleted") {
      this.broadcastRoomState(result.room);
    }
    return new Response(null, { status: 204 });
  }

  private async ticket(request: Request): Promise<Response> {
    const now = Date.now();
    const tokenHash = await hashSecret(parseBearerToken(request.headers));
    const issued = await issueConnectionTicket(now);
    const result = await this.store.issueTicketLatest(
      tokenHash,
      { ticketHash: issued.ticketHash, expiresAt: issued.expiresAt },
      now
    );
    if (result === "missing") throw new HttpProtocolError("ROOM_NOT_FOUND");
    if (result === "expired") throw new HttpProtocolError("ROOM_EXPIRED");
    if (result === "invalid-token") throw new HttpProtocolError("SEAT_TOKEN_INVALID");
    return jsonResponse({ ticket: issued.ticket, expiresInMs: 30_000 }, { status: 201 });
  }

  private async upgrade(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      throw new HttpProtocolError("PROTOCOL_INCOMPATIBLE", { expected: PROTOCOL_SCHEMA_VERSION });
    }
    const ticket = url.searchParams.get("ticket");
    if (ticket === null) throw new HttpProtocolError("CONNECTION_TICKET_EXPIRED");
    const ticketHash = await hashSecret(ticket);
    const now = Date.now();
    const consumed = await this.store.consumeConnectionTicket(ticketHash, now);
    if (consumed === "missing") throw new HttpProtocolError("ROOM_NOT_FOUND");
    if (consumed === "expired") throw new HttpProtocolError("ROOM_EXPIRED");
    if (consumed === "invalid-ticket") throw new HttpProtocolError("CONNECTION_TICKET_EXPIRED");
    const { room: updated, seatId } = consumed;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({
      seatId,
      connectionId: crypto.randomUUID(),
      connectedAt: now
    } satisfies ConnectionAttachment);
    this.ctx.acceptWebSocket(server);
    this.broadcastRoomState(updated);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketClose(_socket: WebSocket): Promise<void> {
    await this.socketEnded();
  }

  async webSocketError(_socket: WebSocket, _error: unknown): Promise<void> {
    await this.socketEnded();
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const run = this.commandTail.then(() => this.handleWebSocketMessage(socket, message));
    this.commandTail = run.catch(() => undefined);
    return run;
  }

  private async handleWebSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let value: ConnectionAttachment | undefined;
    try {
      value = attachment(socket);
    } catch {
      value = undefined;
    }
    if (value === undefined) {
      safeCloseSocket(socket, 4003, "INVALID_ATTACHMENT");
      return;
    }
    const room = await this.requireRoom();
    const activeRecipients = this.activeRoomRecipients(room);
    if (!activeRecipients.some((recipient) => recipient.socket === socket)) return;
    const recipients: CommandRecipient[] = activeRecipients.map((recipient) => ({
      seatId: recipient.attachment.seatId,
      send: (serverMessage) => recipient.socket.send(JSON.stringify(serverMessage)),
      close: (code, reason) => safeCloseSocket(recipient.socket, code, reason)
    }));
    const presence = this.presence(room, activeRecipients);
    await this.commands.handle({
      seatId: value.seatId,
      rawMessage: typeof message === "string" ? message : "",
      now: Date.now(),
      presence,
      recipients
    });
  }

  private async socketEnded(): Promise<void> {
    const now = Date.now();
    const result = await this.store.lookup(now);
    if (result.kind !== "active") return;
    this.broadcastPresence(result.room);
    const hasOpenSocket = this.ctx.getWebSockets().some(
      (socket) => socket.readyState === WebSocket.OPEN
    );
    if (!hasOpenSocket) {
      await this.store.deferExpiry(Math.max(now, result.room.expiresAt));
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const hasOpenSocket = this.ctx.getWebSockets().some(
      (socket) => socket.readyState === WebSocket.OPEN
    );
    const result = await this.store.handleExpiryAlarm(
      now,
      hasOpenSocket,
      now + ROOM_RETENTION_MS
    );
    if (result.kind !== "expired") return;

    const message = JSON.stringify({
      type: "room.expired",
      error: { code: "ROOM_EXPIRED", params: {}, retryable: false }
    });
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(message);
        } catch {
          // A failed peer must not prevent terminal delivery to the others.
        }
        safeCloseSocket(socket, 4002, "ROOM_EXPIRED");
      }
    }
  }

  private async requireRoom(now = Date.now()): Promise<PersistedRoom> {
    const result = await this.store.lookup(now);
    if (result.kind === "missing") throw new HttpProtocolError("ROOM_NOT_FOUND");
    if (result.kind === "expired") throw new HttpProtocolError("ROOM_EXPIRED");
    return result.room;
  }

  private presence(
    room: PersistedRoom,
    recipients: readonly ActiveRoomRecipient[]
  ): PresenceEntry[] {
    const counts = new Map<string, number>();
    for (const recipient of recipients) {
      const seatId = recipient.attachment.seatId;
      counts.set(seatId, (counts.get(seatId) ?? 0) + 1);
    }
    return [...room.seats]
      .sort((left, right) => left.joinOrder - right.joinOrder)
      .map((seat) => ({
        seatId: seat.seatId,
        connectionCount: counts.get(seat.seatId) ?? 0,
        online: (counts.get(seat.seatId) ?? 0) > 0
      }));
  }

  private activeRoomRecipients(room: PersistedRoom): ActiveRoomRecipient[] {
    const seatIds = new Set(room.seats.map((seat) => seat.seatId));
    const recipients: ActiveRoomRecipient[] = [];
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      let value: ConnectionAttachment | undefined;
      try {
        value = attachment(socket);
      } catch {
        safeCloseSocket(socket, 4003, "INVALID_ATTACHMENT");
        continue;
      }
      if (value === undefined) {
        safeCloseSocket(socket, 4003, "INVALID_ATTACHMENT");
        continue;
      }
      if (!seatIds.has(value.seatId)) {
        safeCloseSocket(socket, 4001, "SEAT_LEFT");
        continue;
      }
      recipients.push({ socket, attachment: value });
    }
    return recipients;
  }

  private snapshot(
    room: PersistedRoom,
    seatId: string,
    presence: readonly PresenceEntry[]
  ): RoomSnapshotMessage {
    const projected = projectRoomView(room, seatId, {
      connectedSeatIds: presence.filter((entry) => entry.online).map((entry) => entry.seatId)
    });
    return {
      type: "room.snapshot",
      schemaVersion: PROTOCOL_SCHEMA_VERSION,
      roomVersion: room.roomVersion,
      lifecycle: room.lifecycle,
      publicState: projected.publicState as unknown as Record<string, unknown>,
      privateState: projected.privateState as unknown as Record<string, unknown>,
      allowedActions: (projected.allowedActions ?? {}) as unknown as Record<string, unknown>,
      presence: [...presence]
    };
  }

  private broadcastPresence(room: PersistedRoom): void {
    const recipients = this.activeRoomRecipients(room);
    const presence = this.presence(room, recipients);
    this.sendPresence(recipients, presence);
  }

  private sendPresence(
    recipients: readonly ActiveRoomRecipient[],
    presence: readonly PresenceEntry[]
  ): void {
    const message = JSON.stringify({ type: "presence.changed", presence });
    for (const recipient of recipients) {
      try {
        recipient.socket.send(message);
      } catch {
        // A failed peer must not prevent convergence for the others.
      }
    }
  }

  private broadcastRoomState(room: PersistedRoom): void {
    const recipients = this.activeRoomRecipients(room);
    const presence = this.presence(room, recipients);
    for (const recipient of recipients) {
      try {
        recipient.socket.send(JSON.stringify(
          this.snapshot(room, recipient.attachment.seatId, presence)
        ));
      } catch {
        // One stale or failed peer must not block the remaining room members.
      }
    }
    this.sendPresence(recipients, presence);
  }
}
