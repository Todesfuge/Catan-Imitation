import { useCallback, useEffect, useRef, useState } from "react";
import {
  ERROR_DEFINITIONS,
  MAX_WIRE_BYTES,
  MAX_WIRE_STRING_CODE_POINTS,
  STABLE_ERROR_CODES,
  parseClientWebSocketMessage,
  parseConnectionTicketResponse,
  parseSeatCredentialsResponse,
  parseServerWebSocketMessage,
  type ClientWebSocketMessage,
  type ProtocolError,
  type ProtocolErrorCode,
  type ServerWebSocketMessage
} from "./protocol";
import {
  createInitialOnlineState,
  onlineReducer,
  type OnlineClientAction,
  type OnlineClientState
} from "./onlineReducer";
import {
  getDefaultSeatCredentialStore,
  type SeatCredentialStore
} from "./sessionStorage";

export const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface Scheduler {
  setTimeout(task: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ClientSocket {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  send(value: string): void;
  close(): void;
}

interface RequestDependencies {
  origin: string;
  fetch: FetchLike;
}

interface BootstrapDependencies extends RequestDependencies {
  credentials?: SeatCredentialStore;
}

interface LeaveDependencies extends RequestDependencies {
  credentials: SeatCredentialStore;
}

export interface OnlineRoomDependencies extends BootstrapDependencies {
  credentials: SeatCredentialStore;
  createWebSocket: (url: string) => ClientSocket;
  scheduler: Scheduler;
}

export interface OnlineRoomClient {
  connect(): void;
  dispatch(message: ClientWebSocketMessage): boolean;
  dispose(): void;
  getState(): OnlineClientState;
  subscribe(listener: (state: OnlineClientState) => void): () => void;
}

export interface OnlineSeatSession {
  roomCode: string;
  seatId: string;
}

export class OnlineRequestError extends Error {
  readonly protocolError: ProtocolError;

  constructor(protocolError: ProtocolError) {
    super(protocolError.code);
    this.name = "OnlineRequestError";
    this.protocolError = protocolError;
  }
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function endpoint(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

function internalError(): ProtocolError {
  return { code: "INTERNAL_ERROR", params: {}, retryable: true };
}

export function sanitizeProtocolError(
  error: ProtocolError,
  secrets: readonly string[] = []
): ProtocolError {
  const containsCredential = (value: string) =>
    /[A-Za-z0-9_-]{32,}/.test(value) ||
    secrets.some((secret) => secret.length > 0 && value.includes(secret));
  for (const [key, entry] of Object.entries(error.params)) {
    if (containsCredential(key) || (typeof entry === "string" && containsCredential(entry))) {
      return internalError();
    }
  }
  return { ...error, params: { ...error.params } };
}

function safeProtocolError(value: unknown, secrets: readonly string[] = []): ProtocolError {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return internalError();
  const candidate = value as { code?: unknown; params?: unknown; retryable?: unknown };
  if (Object.keys(candidate).length !== 3 ||
      !Object.hasOwn(candidate, "code") ||
      !Object.hasOwn(candidate, "params") ||
      !Object.hasOwn(candidate, "retryable")) return internalError();
  if (
    typeof candidate.code !== "string" ||
    !STABLE_ERROR_CODES.includes(candidate.code as ProtocolErrorCode) ||
    candidate.params === null ||
    typeof candidate.params !== "object" ||
    Array.isArray(candidate.params) ||
    candidate.retryable !== ERROR_DEFINITIONS[candidate.code as ProtocolErrorCode].retryable
  ) {
    return internalError();
  }
  const entries = Object.entries(candidate.params as Record<string, unknown>);
  if (entries.length > 16) return internalError();
  const params: ProtocolError["params"] = {};
  for (const [key, entry] of entries) {
    const keyLength = Array.from(key).length;
    if (keyLength < 1 || keyLength > MAX_WIRE_STRING_CODE_POINTS ||
        /token|ticket|secret|hash|credential|authorization/i.test(key)) return internalError();
    if (typeof entry === "string") {
      const valueLength = Array.from(entry).length;
      if (valueLength < 1 || valueLength > MAX_WIRE_STRING_CODE_POINTS) return internalError();
      params[key] = entry;
    } else if (typeof entry === "boolean") {
      params[key] = entry;
    } else if (typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0) {
      params[key] = entry;
    } else {
      return internalError();
    }
  }
  return sanitizeProtocolError({
    code: candidate.code as ProtocolErrorCode,
    params,
    retryable: candidate.retryable as boolean
  }, secrets);
}

async function cancelResponseBody(response: Response): Promise<void> {
  try { await response.body?.cancel(); } catch { /* best-effort resource cleanup */ }
}

async function responseText(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  let declaredLength: number | undefined;
  if (contentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(contentLength)) {
      await cancelResponseBody(response);
      throw new OnlineRequestError(internalError());
    }
    declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_WIRE_BYTES) {
      await cancelResponseBody(response);
      throw new OnlineRequestError(internalError());
    }
  }
  if (!response.body) throw new OnlineRequestError(internalError());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_WIRE_BYTES) {
        await reader.cancel();
        throw new OnlineRequestError(internalError());
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof OnlineRequestError) throw error;
    throw new OnlineRequestError(internalError());
  } finally {
    reader.releaseLock();
  }
  if (declaredLength !== undefined && declaredLength !== byteLength) {
    throw new OnlineRequestError(internalError());
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new OnlineRequestError(internalError());
  }
}

async function requireSuccessText(response: Response, secrets: readonly string[] = []): Promise<string> {
  const text = await responseText(response);
  if (response.ok) return text;
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { parsed = undefined; }
  const error = parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1 && Object.hasOwn(parsed, "error")
    ? safeProtocolError((parsed as { error?: unknown }).error, secrets) : internalError();
  throw new OnlineRequestError(error);
}

async function requestSeat(
  path: string,
  nickname: string,
  dependencies: BootstrapDependencies
): Promise<OnlineSeatSession> {
  let response: Response;
  try {
    response = await dependencies.fetch(endpoint(dependencies.origin, path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname })
    });
  } catch {
    throw new OnlineRequestError(internalError());
  }
  let credential;
  try {
    credential = parseSeatCredentialsResponse(await requireSuccessText(response));
  } catch (error) {
    if (error instanceof OnlineRequestError) throw error;
    throw new OnlineRequestError(internalError());
  }
  const result = (dependencies.credentials ?? getDefaultSeatCredentialStore()).save(credential);
  if (!result.saved) throw new OnlineRequestError(internalError());
  return { roomCode: credential.roomCode, seatId: credential.seatId };
}

export function createOnlineRoom(
  nickname: string,
  dependencies: BootstrapDependencies
): Promise<OnlineSeatSession> {
  return requestSeat("/api/rooms", nickname, dependencies);
}

export function joinOnlineRoom(
  roomCode: string,
  nickname: string,
  dependencies: BootstrapDependencies
): Promise<OnlineSeatSession> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  return requestSeat(`/api/rooms/${encodeURIComponent(normalizedRoomCode)}/join`, nickname, dependencies);
}

export async function leaveOnlineRoom(
  session: OnlineSeatSession,
  dependencies: LeaveDependencies
): Promise<void> {
  const roomCode = normalizeRoomCode(session.roomCode);
  const credential = dependencies.credentials.load(roomCode);
  if (!credential || credential.seatId !== session.seatId) {
    throw new OnlineRequestError({ code: "SEAT_TOKEN_INVALID", params: {}, retryable: false });
  }
  let response: Response;
  try {
    response = await dependencies.fetch(
      endpoint(
        dependencies.origin,
        `/api/rooms/${encodeURIComponent(roomCode)}/seats/${encodeURIComponent(session.seatId)}`
      ),
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${credential.seatToken}` }
      }
    );
  } catch {
    throw new OnlineRequestError(internalError());
  }
  if (response.status === 204) {
    await cancelResponseBody(response);
    dependencies.credentials.remove(roomCode);
    return;
  }
  try {
    await requireSuccessText(response, [credential.seatToken]);
  } catch (error) {
    if (error instanceof OnlineRequestError) throw error;
    throw new OnlineRequestError(internalError());
  }
  throw new OnlineRequestError(internalError());
}

export async function requestConnectionTicket(
  roomCode: string,
  seatToken: string,
  dependencies: RequestDependencies & { signal?: AbortSignal }
): Promise<string> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  let response: Response;
  try {
    response = await dependencies.fetch(
      endpoint(dependencies.origin, `/api/rooms/${encodeURIComponent(normalizedRoomCode)}/connection-ticket`),
      {
        method: "POST",
        headers: { authorization: `Bearer ${seatToken}` },
        signal: dependencies.signal
      }
    );
  } catch (error) {
    if (dependencies.signal?.aborted) throw error;
    throw new OnlineRequestError(internalError());
  }
  try {
    return parseConnectionTicketResponse(await requireSuccessText(response, [seatToken])).ticket;
  } catch (error) {
    if (error instanceof OnlineRequestError) throw error;
    throw new OnlineRequestError(internalError());
  }
}

function webSocketUrl(origin: string, roomCode: string, ticket: string): string {
  const url = new URL(
    `/api/rooms/${encodeURIComponent(roomCode)}/connect`,
    origin
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

function terminalAction(error: ProtocolError): OnlineClientAction | undefined {
  if (error.code === "ROOM_EXPIRED") {
    return { type: "server.message", message: { type: "room.expired", error } };
  }
  if (error.code === "PROTOCOL_INCOMPATIBLE") {
    return { type: "server.message", message: { type: "protocol.incompatible", error } };
  }
  return undefined;
}

function sanitizeServerMessage(
  message: ServerWebSocketMessage,
  secrets: readonly string[]
): ServerWebSocketMessage {
  if (!("error" in message)) return message;
  return { ...message, error: sanitizeProtocolError(message.error, secrets) };
}

export function createOnlineRoomClient(
  roomCode: string,
  dependencies: OnlineRoomDependencies
): OnlineRoomClient {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const listeners = new Set<(state: OnlineClientState) => void>();
  let state = createInitialOnlineState();
  let socket: ClientSocket | undefined;
  let socketCleanup: (() => void) | undefined;
  let timer: unknown;
  let abortController: AbortController | undefined;
  let generation = 0;
  let retryAttempt = 0;
  let disposed = false;

  const reduce = (action: OnlineClientAction) => {
    const next = onlineReducer(state, action);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener(state);
  };

  const clearPending = () => {
    if (timer !== undefined) {
      dependencies.scheduler.clearTimeout(timer);
      timer = undefined;
    }
    abortController?.abort();
    abortController = undefined;
  };

  const scheduleReconnect = () => {
    if (disposed || state.status === "expired" || state.status === "incompatible" || timer !== undefined) return;
    retryAttempt += 1;
    const delay = RECONNECT_DELAYS_MS[Math.min(retryAttempt - 1, RECONNECT_DELAYS_MS.length - 1)];
    reduce({ type: "retry.scheduled", attempt: retryAttempt });
    timer = dependencies.scheduler.setTimeout(() => {
      timer = undefined;
      void openSocket();
    }, delay);
  };

  const detachSocket = (target: ClientSocket, handlers: Record<string, (event: unknown) => void>) => {
    for (const [type, listener] of Object.entries(handlers)) target.removeEventListener(type, listener);
  };

  const openSocket = async (): Promise<void> => {
    if (disposed || state.status === "expired" || state.status === "incompatible") return;
    const credential = dependencies.credentials.load(normalizedRoomCode);
    if (!credential) {
      reduce({ type: "transport.failed" });
      return;
    }
    const currentGeneration = ++generation;
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    let ticket: string;
    try {
      ticket = await requestConnectionTicket(normalizedRoomCode, credential.seatToken, {
        origin: dependencies.origin,
        fetch: dependencies.fetch,
        signal: controller.signal
      });
    } catch (error) {
      if (disposed || controller.signal.aborted || currentGeneration !== generation) return;
      abortController = undefined;
      const protocolError = error instanceof OnlineRequestError ? error.protocolError : internalError();
      const terminal = terminalAction(protocolError);
      if (terminal) {
        reduce(terminal);
        clearPending();
      } else if (protocolError.retryable) {
        reduce({ type: "transport.failed", error: protocolError });
        scheduleReconnect();
      } else {
        reduce({ type: "transport.failed", error: protocolError });
      }
      return;
    }
    abortController = undefined;
    if (disposed || currentGeneration !== generation) return;

    let nextSocket: ClientSocket;
    try {
      nextSocket = dependencies.createWebSocket(webSocketUrl(dependencies.origin, normalizedRoomCode, ticket));
    } catch {
      reduce({ type: "transport.failed", error: internalError() });
      scheduleReconnect();
      return;
    }
    const previousSocket = socket;
    const previousCleanup = socketCleanup;
    socketCleanup = undefined;
    previousCleanup?.();
    socket = undefined;
    previousSocket?.close();
    socket = nextSocket;
    let cleanupSocketListeners = () => undefined;
    const handlers: Record<string, (event: unknown) => void> = {
      open: () => {
        if (disposed || socket !== nextSocket || currentGeneration !== generation) return;
        retryAttempt = 0;
        reduce({ type: "socket.opened" });
      },
      message: (event) => {
        if (disposed || socket !== nextSocket || currentGeneration !== generation) return;
        const data = (event as { data?: unknown }).data;
        if (typeof data !== "string") return;
        try {
          const message = sanitizeServerMessage(
            parseServerWebSocketMessage(data),
            [credential.seatToken, ticket]
          );
          reduce({ type: "server.message", message });
          if (message.type === "room.expired" || message.type === "protocol.incompatible") {
            clearPending();
            cleanupSocketListeners();
            socket = undefined;
            nextSocket.close();
          }
        } catch {
          reduce({
            type: "protocol.failed",
            error: { code: "PROTOCOL_INCOMPATIBLE", params: { expected: 1 }, retryable: false }
          });
          clearPending();
          cleanupSocketListeners();
          socket = undefined;
          nextSocket.close();
        }
      },
      close: () => {
        if (disposed || socket !== nextSocket || currentGeneration !== generation) return;
        cleanupSocketListeners();
        socket = undefined;
        reduce({ type: "socket.closed" });
        scheduleReconnect();
      },
      error: () => {
        if (disposed || socket !== nextSocket || currentGeneration !== generation) return;
        cleanupSocketListeners();
        socket = undefined;
        nextSocket.close();
        reduce({ type: "socket.closed" });
        scheduleReconnect();
      }
    };
    for (const [type, listener] of Object.entries(handlers)) nextSocket.addEventListener(type, listener);
    cleanupSocketListeners = () => {
      detachSocket(nextSocket, handlers);
      if (socketCleanup === cleanupSocketListeners) socketCleanup = undefined;
    };
    socketCleanup = cleanupSocketListeners;
  };

  return {
    connect() {
      if (disposed || socket || abortController || timer !== undefined || state.status === "connecting") return;
      retryAttempt = 0;
      reduce({ type: "connect.started" });
      void openSocket();
    },
    dispatch(message) {
      if (disposed || state.status !== "connected" || !socket || socket.readyState !== 1) return false;
      try {
        const serialized = JSON.stringify(message);
        if (typeof serialized !== "string") return false;
        const parsed = parseClientWebSocketMessage(serialized);
        socket.send(JSON.stringify(parsed));
        return true;
      } catch {
        return false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      clearPending();
      const current = socket;
      const cleanup = socketCleanup;
      socketCleanup = undefined;
      cleanup?.();
      socket = undefined;
      current?.close();
      listeners.clear();
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function browserDependencies(): OnlineRoomDependencies {
  return {
    origin: window.location.origin,
    fetch: window.fetch.bind(window),
    credentials: getDefaultSeatCredentialStore(),
    createWebSocket: (url) => new WebSocket(url) as unknown as ClientSocket,
    scheduler: {
      setTimeout: (task, delayMs) => window.setTimeout(task, delayMs),
      clearTimeout: (handle) => window.clearTimeout(handle as number)
    }
  };
}

export function useOnlineRoom(
  roomCode: string,
  injectedDependencies?: OnlineRoomDependencies
): {
  state: OnlineClientState;
  dispatch: (message: ClientWebSocketMessage) => boolean;
  reconnect: () => void;
} {
  const dependenciesRef = useRef(injectedDependencies);
  dependenciesRef.current = injectedDependencies;
  const clientRef = useRef<OnlineRoomClient>();
  const [state, setState] = useState<OnlineClientState>(createInitialOnlineState);

  useEffect(() => {
    const client = createOnlineRoomClient(roomCode, dependenciesRef.current ?? browserDependencies());
    clientRef.current = client;
    const unsubscribe = client.subscribe(setState);
    setState(client.getState());
    client.connect();
    return () => {
      unsubscribe();
      client.dispose();
      if (clientRef.current === client) clientRef.current = undefined;
    };
  }, [roomCode]);

  const dispatch = useCallback((message: ClientWebSocketMessage) =>
    clientRef.current?.dispatch(message) ?? false, []);
  const reconnect = useCallback(() => clientRef.current?.connect(), []);
  return { state, dispatch, reconnect };
}
