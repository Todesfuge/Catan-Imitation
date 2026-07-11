import { useCallback, useEffect, useRef, useState } from "react";
import {
  ERROR_DEFINITIONS,
  STABLE_ERROR_CODES,
  parseConnectionTicketResponse,
  parseSeatCredentialsResponse,
  parseServerWebSocketMessage,
  type ClientWebSocketMessage,
  type ProtocolError,
  type ProtocolErrorCode
} from "./protocol";
import {
  createInitialOnlineState,
  onlineReducer,
  type OnlineClientAction,
  type OnlineClientState
} from "./onlineReducer";
import {
  createSeatCredentialStore,
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
  credentials: SeatCredentialStore;
}

export interface OnlineRoomDependencies extends BootstrapDependencies {
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

function safeProtocolError(value: unknown): ProtocolError {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return internalError();
  const candidate = value as { code?: unknown; params?: unknown; retryable?: unknown };
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
  const params: ProtocolError["params"] = {};
  for (const [key, entry] of Object.entries(candidate.params as Record<string, unknown>)) {
    if (typeof entry === "string" || typeof entry === "boolean" ||
        (typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0)) {
      params[key] = entry;
    }
  }
  return {
    code: candidate.code as ProtocolErrorCode,
    params,
    retryable: candidate.retryable as boolean
  };
}

async function responseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    throw new OnlineRequestError(internalError());
  }
}

async function requireSuccessText(response: Response): Promise<string> {
  const text = await responseText(response);
  if (response.ok) return text;
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { parsed = undefined; }
  const error = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? safeProtocolError((parsed as { error?: unknown }).error)
    : internalError();
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
  dependencies.credentials.save(credential);
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
    return parseConnectionTicketResponse(await requireSuccessText(response)).ticket;
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

export function createOnlineRoomClient(
  roomCode: string,
  dependencies: OnlineRoomDependencies
): OnlineRoomClient {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const listeners = new Set<(state: OnlineClientState) => void>();
  let state = createInitialOnlineState();
  let socket: ClientSocket | undefined;
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
    socket = nextSocket;
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
          const message = parseServerWebSocketMessage(data);
          reduce({ type: "server.message", message });
          if (message.type === "room.expired" || message.type === "protocol.incompatible") {
            clearPending();
            detachSocket(nextSocket, handlers);
            socket = undefined;
            nextSocket.close();
          }
        } catch {
          reduce({
            type: "protocol.failed",
            error: { code: "PROTOCOL_INCOMPATIBLE", params: { expected: 1 }, retryable: false }
          });
          clearPending();
          detachSocket(nextSocket, handlers);
          socket = undefined;
          nextSocket.close();
        }
      },
      close: () => {
        if (disposed || socket !== nextSocket || currentGeneration !== generation) return;
        detachSocket(nextSocket, handlers);
        socket = undefined;
        reduce({ type: "socket.closed" });
        scheduleReconnect();
      },
      error: () => {
        if (disposed || socket !== nextSocket || currentGeneration !== generation) return;
        nextSocket.close();
      }
    };
    for (const [type, listener] of Object.entries(handlers)) nextSocket.addEventListener(type, listener);
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
      socket.send(JSON.stringify(message));
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      clearPending();
      const current = socket;
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
    credentials: createSeatCredentialStore(),
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
