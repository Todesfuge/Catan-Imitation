import type { MessageKey } from "../ui/i18n";
import type { ProtocolErrorCode } from "./protocol";

const noticeKeys: Record<ProtocolErrorCode, MessageKey> = {
  ROOM_NOT_FOUND: "online.error.roomNotFound",
  ROOM_FULL: "online.error.roomFull",
  ROOM_ALREADY_STARTED: "online.error.roomStarted",
  SEAT_TOKEN_INVALID: "online.error.seatInvalid",
  CONNECTION_TICKET_EXPIRED: "online.error.connectionExpired",
  VERSION_CONFLICT: "online.error.versionConflict",
  COMMAND_NOT_ALLOWED: "online.error.commandNotAllowed",
  RULE_VIOLATION: "online.error.commandNotAllowed",
  RATE_LIMITED: "online.error.rateLimited",
  ROOM_EXPIRED: "online.error.roomExpired",
  PROTOCOL_INCOMPATIBLE: "online.error.protocolIncompatible",
  INTERNAL_ERROR: "online.error.internal"
};

export function protocolNoticeKey(code: ProtocolErrorCode): MessageKey {
  return noticeKeys[code];
}
