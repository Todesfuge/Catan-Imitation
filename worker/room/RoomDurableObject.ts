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

const ROOM_RETENTION_MS = 24 * 60 * 60 * 1_000;

interface ConnectionAttachment {
  seatId: string;
  connectionId: string;
  connectedAt: number;
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
  return typeof candidate.seatId === "string" &&
    typeof candidate.connectionId === "string" &&
    typeof candidate.connectedAt === "number"
    ? candidate as ConnectionAttachment
    : undefined;
}

export class RoomDurableObject {
  private readonly store: RoomStore;

  constructor(private readonly ctx: DurableObjectState, _env: Env) {
    this.store = new RoomStore(ctx.storage);
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
    return jsonResponse({ roomCode: updated.roomCode, seatId, seatToken: credentials.seatToken }, { status: 201 });
  }

  private async leave(request: Request, seatId: string): Promise<Response> {
    const tokenHash = await hashSecret(parseBearerToken(request.headers));
    const connectedSeatIds = this.ctx.getWebSockets().flatMap((socket) => {
      const value = attachment(socket);
      return value && socket.readyState === WebSocket.OPEN ? [value.seatId] : [];
    });
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
    for (const socket of this.ctx.getWebSockets()) {
      if (attachment(socket)?.seatId === seatId && socket.readyState === WebSocket.OPEN) {
        socket.close(4001, "SEAT_LEFT");
      }
    }
    if (result !== "deleted") this.broadcastPresence(result.room);
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
    server.send(JSON.stringify(this.snapshot(updated, seatId)));
    this.broadcastPresence(updated);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketClose(_socket: WebSocket): Promise<void> {
    await this.socketEnded();
  }

  async webSocketError(_socket: WebSocket, _error: unknown): Promise<void> {
    await this.socketEnded();
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
        try {
          socket.close(4002, "ROOM_EXPIRED");
        } catch {
          // Continue closing the remaining peers.
        }
      }
    }
  }

  private async requireRoom(now = Date.now()): Promise<PersistedRoom> {
    const result = await this.store.lookup(now);
    if (result.kind === "missing") throw new HttpProtocolError("ROOM_NOT_FOUND");
    if (result.kind === "expired") throw new HttpProtocolError("ROOM_EXPIRED");
    return result.room;
  }

  private presence(room: PersistedRoom): PresenceEntry[] {
    const counts = new Map<string, number>();
    for (const socket of this.ctx.getWebSockets()) {
      const value = attachment(socket);
      if (value && socket.readyState === WebSocket.OPEN) {
        counts.set(value.seatId, (counts.get(value.seatId) ?? 0) + 1);
      }
    }
    return [...room.seats]
      .sort((left, right) => left.joinOrder - right.joinOrder)
      .map((seat) => ({
        seatId: seat.seatId,
        connectionCount: counts.get(seat.seatId) ?? 0,
        online: (counts.get(seat.seatId) ?? 0) > 0
      }));
  }

  private snapshot(room: PersistedRoom, seatId: string): RoomSnapshotMessage {
    const projected = projectRoomView(room, seatId, {
      connectedSeatIds: this.presence(room).filter((entry) => entry.online).map((entry) => entry.seatId)
    });
    return {
      type: "room.snapshot",
      schemaVersion: PROTOCOL_SCHEMA_VERSION,
      roomVersion: room.roomVersion,
      lifecycle: room.lifecycle,
      publicState: projected.publicState as unknown as Record<string, unknown>,
      privateState: projected.privateState as unknown as Record<string, unknown>,
      allowedActions: (projected.allowedActions ?? {}) as unknown as Record<string, unknown>,
      presence: this.presence(room)
    };
  }

  private broadcastPresence(room: PersistedRoom): void {
    const message = JSON.stringify({ type: "presence.changed", presence: this.presence(room) });
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }
}
