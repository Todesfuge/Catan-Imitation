import {
  parseServerWebSocketMessage,
  type ProtocolError,
  type RoomSnapshotMessage,
  type ServerWebSocketMessage
} from "./protocol";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "expired"
  | "incompatible";

export interface OnlineClientState {
  status: ConnectionStatus;
  snapshot?: RoomSnapshotMessage;
  notice?: ProtocolError;
  noticeCommandId?: string;
  retryAttempt: number;
}

export type OnlineClientAction =
  | { type: "connect.started" }
  | { type: "socket.opened" }
  | { type: "socket.closed" }
  | { type: "retry.scheduled"; attempt: number }
  | { type: "transport.failed"; error?: ProtocolError }
  | { type: "server.message"; message: ServerWebSocketMessage }
  | { type: "protocol.failed"; error: ProtocolError };

export function createInitialOnlineState(): OnlineClientState {
  return { status: "offline", retryAttempt: 0 };
}

function isTerminal(state: OnlineClientState): boolean {
  return state.status === "expired" || state.status === "incompatible";
}

function attachedSnapshot(value: unknown): RoomSnapshotMessage | undefined {
  try {
    const parsed = parseServerWebSocketMessage(JSON.stringify(value));
    return parsed.type === "room.snapshot" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function onlineReducer(
  state: OnlineClientState,
  action: OnlineClientAction
): OnlineClientState {
  if (isTerminal(state) && action.type !== "server.message") return state;

  switch (action.type) {
    case "connect.started":
      return { ...state, status: "connecting", retryAttempt: 0, notice: undefined, noticeCommandId: undefined };
    case "socket.opened":
      return { ...state, status: "connected", retryAttempt: 0, notice: undefined, noticeCommandId: undefined };
    case "socket.closed":
      return isTerminal(state) ? state : { ...state, status: "offline" };
    case "retry.scheduled":
      return isTerminal(state)
        ? state
        : { ...state, status: "reconnecting", retryAttempt: action.attempt };
    case "transport.failed":
      return isTerminal(state)
        ? state
        : { ...state, status: "offline", noticeCommandId: undefined, ...(action.error ? { notice: action.error } : {}) };
    case "protocol.failed":
      return { ...state, status: "incompatible", notice: action.error, noticeCommandId: undefined };
    case "server.message": {
      const message = action.message;
      if (message.type === "room.expired") {
        return { ...state, status: "expired", notice: message.error, noticeCommandId: undefined };
      }
      if (message.type === "protocol.incompatible") {
        return { ...state, status: "incompatible", notice: message.error, noticeCommandId: undefined };
      }
      if (isTerminal(state)) return state;
      if (message.type === "room.snapshot") {
        if (state.snapshot && message.roomVersion <= state.snapshot.roomVersion) return state;
        return { ...state, status: "connected", retryAttempt: 0, snapshot: message, notice: undefined, noticeCommandId: undefined };
      }
      if (message.type === "presence.changed") {
        if (!state.snapshot) return state;
        return { ...state, snapshot: { ...state.snapshot, presence: message.presence } };
      }
      const conflictSnapshot = message.error.code === "VERSION_CONFLICT"
        ? attachedSnapshot(message.snapshot)
        : undefined;
      return {
        ...state,
        ...(conflictSnapshot && (!state.snapshot || conflictSnapshot.roomVersion > state.snapshot.roomVersion)
          ? { snapshot: conflictSnapshot }
          : {}),
        notice: message.error,
        noticeCommandId: message.commandId
      };
    }
  }
}
