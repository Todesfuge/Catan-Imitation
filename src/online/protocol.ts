import { resources, type Resource, type ResourceMap } from "../domain/types";

export const PROTOCOL_SCHEMA_VERSION = 1 as const;
export const MAX_WIRE_BYTES = 16 * 1024;
export const MAX_NICKNAME_CODE_POINTS = 20;
export const MAX_WIRE_STRING_CODE_POINTS = 128;
export const MAX_WIRE_INTEGER = Number.MAX_SAFE_INTEGER;

export const STABLE_ERROR_CODES = [
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_ALREADY_STARTED",
  "SEAT_TOKEN_INVALID",
  "CONNECTION_TICKET_EXPIRED",
  "VERSION_CONFLICT",
  "COMMAND_NOT_ALLOWED",
  "RULE_VIOLATION",
  "RATE_LIMITED",
  "ROOM_EXPIRED",
  "PROTOCOL_INCOMPATIBLE",
  "INTERNAL_ERROR"
] as const;

export type ProtocolErrorCode = (typeof STABLE_ERROR_CODES)[number];

export const ERROR_DEFINITIONS: Readonly<
  Record<ProtocolErrorCode, { readonly httpStatus: number; readonly retryable: boolean }>
> = {
  ROOM_NOT_FOUND: { httpStatus: 404, retryable: false },
  ROOM_FULL: { httpStatus: 409, retryable: false },
  ROOM_ALREADY_STARTED: { httpStatus: 409, retryable: false },
  SEAT_TOKEN_INVALID: { httpStatus: 401, retryable: false },
  CONNECTION_TICKET_EXPIRED: { httpStatus: 401, retryable: true },
  VERSION_CONFLICT: { httpStatus: 409, retryable: true },
  COMMAND_NOT_ALLOWED: { httpStatus: 403, retryable: false },
  RULE_VIOLATION: { httpStatus: 422, retryable: false },
  RATE_LIMITED: { httpStatus: 429, retryable: true },
  ROOM_EXPIRED: { httpStatus: 410, retryable: false },
  PROTOCOL_INCOMPATIBLE: { httpStatus: 426, retryable: false },
  INTERNAL_ERROR: { httpStatus: 500, retryable: true }
};

export type ProtocolErrorParams = Record<string, string | number | boolean>;

export interface ProtocolError {
  code: ProtocolErrorCode;
  params: ProtocolErrorParams;
  retryable: boolean;
}

export interface HealthResponse {
  ok: true;
  schemaVersion: typeof PROTOCOL_SCHEMA_VERSION;
}

export interface NicknameRequest {
  nickname: string;
}

export interface SeatCredentialsResponse {
  roomCode: string;
  seatId: string;
  seatToken: string;
}

export interface ConnectionTicketResponse {
  ticket: string;
  expiresInMs: number;
}

export type NetworkMatchCommand =
  | { type: "PLACE_SETUP_SETTLEMENT"; vertexId: string }
  | { type: "PLACE_SETUP_ROAD"; edgeId: string }
  | { type: "ROLL_DICE" }
  | { type: "END_TURN" }
  | { type: "BUILD_ROAD"; edgeId: string }
  | { type: "BUILD_SETTLEMENT"; vertexId: string }
  | { type: "BUILD_CITY"; buildingId: string }
  | { type: "BUY_DEVELOPMENT_CARD" }
  | { type: "PLAY_DEVELOPMENT_CARD"; cardId: string }
  | { type: "PLAY_KNIGHT_CARD"; cardId: string }
  | { type: "PLACE_FREE_ROAD"; edgeId: string }
  | { type: "CHOOSE_YEAR_OF_PLENTY_RESOURCE"; resource: Resource }
  | { type: "CHOOSE_MONOPOLY_RESOURCE"; resource: Resource }
  | { type: "MARITIME_TRADE"; give: Resource; receive: Resource }
  | { type: "PUBLISH_PLAYER_TRADE"; offered: ResourceMap; requested: ResourceMap }
  | { type: "CANCEL_PLAYER_TRADE" }
  | { type: "ACCEPT_PLAYER_TRADE" }
  | { type: "DISCARD_FOR_SEVEN"; resources: ResourceMap }
  | { type: "PLACE_ROBBER"; hexId: string }
  | { type: "STEAL_ROBBER_RESOURCE"; victimId: string }
  | { type: "COMPLETE_TRADE_SLOT"; slotId: string }
  | { type: "TRANSFER_TOKENS"; toPlayerId: string; amount: number }
  | { type: "START_GATHERING" }
  | { type: "OPEN_AUCTION" }
  | { type: "REDEEM_GATHERING"; resources: ResourceMap }
  | { type: "REDEEM_PRIZE" };

interface VersionedClientMessage {
  commandId: string;
  expectedVersion: number;
}

export type ClientWebSocketMessage =
  | (VersionedClientMessage & { type: "room.ready"; ready: boolean })
  | (VersionedClientMessage & { type: "room.start" })
  | (VersionedClientMessage & { type: "match.command"; command: NetworkMatchCommand })
  | (VersionedClientMessage & { type: "auction.submitBid"; amount: number })
  | { type: "connection.heartbeat" };

export type RoomLifecycle = "lobby" | "playing" | "finished" | "expired";
export type ProjectionObject = Record<string, unknown>;

export interface PresenceEntry {
  seatId: string;
  connectionCount: number;
  online: boolean;
}

export interface RoomSnapshotMessage {
  type: "room.snapshot";
  schemaVersion: typeof PROTOCOL_SCHEMA_VERSION;
  roomVersion: number;
  lifecycle: RoomLifecycle;
  publicState: ProjectionObject;
  privateState: ProjectionObject;
  allowedActions: ProjectionObject;
  presence: PresenceEntry[];
  acknowledgedCommandId?: string;
}

export type ServerWebSocketMessage =
  | RoomSnapshotMessage
  | {
      type: "command.rejected";
      commandId: string;
      error: ProtocolError;
      snapshot?: ProjectionObject;
    }
  | { type: "presence.changed"; presence: PresenceEntry[] }
  | { type: "room.expired"; error: ProtocolError }
  | { type: "protocol.incompatible"; error: ProtocolError };

export class ProtocolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolValidationError";
  }
}

type JsonObject = Record<string, unknown>;

const commandIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(path: string, reason: string): never {
  throw new ProtocolValidationError(`${path} ${reason}`);
}

function parseWireJson(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > MAX_WIRE_BYTES) {
    fail("message", "exceeds the 16 KiB limit");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail("message", "must be valid JSON");
  }
}

function objectAt(value: unknown, path: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as JsonObject;
}

function exactObject(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = []
): JsonObject {
  const object = objectAt(value, path);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "is not allowed");
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key)) fail(`${path}.${key}`, "is required");
  }
  return object;
}

function stringAt(
  value: unknown,
  path: string,
  maximum = MAX_WIRE_STRING_CODE_POINTS
): string {
  if (typeof value !== "string") fail(path, "must be a string");
  const length = Array.from(value).length;
  if (length < 1 || length > maximum) {
    fail(path, `must contain 1 through ${maximum} Unicode code points`);
  }
  return value;
}

function integerAt(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_WIRE_INTEGER
  ) {
    fail(path, `must be a non-negative safe integer no greater than ${MAX_WIRE_INTEGER}`);
  }
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function commandIdAt(value: unknown, path: string): string {
  const id = stringAt(value, path);
  if (!commandIdPattern.test(id)) fail(path, "must be a canonical UUID");
  return id;
}

function literalAt<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail(path, `must be one of: ${values.join(", ")}`);
  }
  return value as T;
}

function resourceAt(value: unknown, path: string): Resource {
  return literalAt(value, path, resources);
}

function resourceMapAt(value: unknown, path: string): ResourceMap {
  const object = exactObject(value, path, resources);
  return {
    wood: integerAt(object.wood, `${path}.wood`),
    brick: integerAt(object.brick, `${path}.brick`),
    wool: integerAt(object.wool, `${path}.wool`),
    grain: integerAt(object.grain, `${path}.grain`),
    ore: integerAt(object.ore, `${path}.ore`)
  };
}

function versionedFields(object: JsonObject): VersionedClientMessage {
  return {
    commandId: commandIdAt(object.commandId, "message.commandId"),
    expectedVersion: integerAt(object.expectedVersion, "message.expectedVersion")
  };
}

export function parseHealthResponse(text: string): HealthResponse {
  const object = exactObject(parseWireJson(text), "body", ["ok", "schemaVersion"]);
  if (object.ok !== true) fail("body.ok", "must be true");
  if (object.schemaVersion !== PROTOCOL_SCHEMA_VERSION) {
    fail("body.schemaVersion", `must equal ${PROTOCOL_SCHEMA_VERSION}`);
  }
  return { ok: true, schemaVersion: PROTOCOL_SCHEMA_VERSION };
}

export function parseNicknameRequest(text: string): NicknameRequest {
  const object = exactObject(parseWireJson(text), "body", ["nickname"]);
  if (typeof object.nickname !== "string") fail("body.nickname", "must be a string");
  const nickname = object.nickname.trim();
  stringAt(nickname, "body.nickname", MAX_NICKNAME_CODE_POINTS);
  return { nickname };
}

export function parseSeatCredentialsResponse(text: string): SeatCredentialsResponse {
  const object = exactObject(parseWireJson(text), "body", ["roomCode", "seatId", "seatToken"]);
  return {
    roomCode: stringAt(object.roomCode, "body.roomCode"),
    seatId: stringAt(object.seatId, "body.seatId"),
    seatToken: stringAt(object.seatToken, "body.seatToken")
  };
}

export function parseConnectionTicketResponse(text: string): ConnectionTicketResponse {
  const object = exactObject(parseWireJson(text), "body", ["ticket", "expiresInMs"]);
  return {
    ticket: stringAt(object.ticket, "body.ticket"),
    expiresInMs: integerAt(object.expiresInMs, "body.expiresInMs")
  };
}

function noPayloadCommand(object: JsonObject, type: NetworkMatchCommand["type"]): NetworkMatchCommand {
  exactObject(object, "message.command", ["type"]);
  return { type } as NetworkMatchCommand;
}

function oneStringCommand<K extends string, T extends NetworkMatchCommand["type"]>(
  object: JsonObject,
  type: T,
  key: K
): NetworkMatchCommand {
  exactObject(object, "message.command", ["type", key]);
  return { type, [key]: stringAt(object[key], `message.command.${key}`) } as NetworkMatchCommand;
}

function parseNetworkMatchCommand(value: unknown): NetworkMatchCommand {
  const object = objectAt(value, "message.command");
  const type = stringAt(object.type, "message.command.type");

  switch (type) {
    case "PLACE_SETUP_SETTLEMENT":
    case "BUILD_SETTLEMENT":
      return oneStringCommand(object, type, "vertexId");
    case "PLACE_SETUP_ROAD":
    case "BUILD_ROAD":
    case "PLACE_FREE_ROAD":
      return oneStringCommand(object, type, "edgeId");
    case "BUILD_CITY":
      return oneStringCommand(object, type, "buildingId");
    case "PLAY_DEVELOPMENT_CARD":
    case "PLAY_KNIGHT_CARD":
      return oneStringCommand(object, type, "cardId");
    case "PLACE_ROBBER":
      return oneStringCommand(object, type, "hexId");
    case "STEAL_ROBBER_RESOURCE":
      return oneStringCommand(object, type, "victimId");
    case "COMPLETE_TRADE_SLOT":
      return oneStringCommand(object, type, "slotId");
    case "ROLL_DICE":
    case "END_TURN":
    case "BUY_DEVELOPMENT_CARD":
    case "CANCEL_PLAYER_TRADE":
    case "ACCEPT_PLAYER_TRADE":
    case "START_GATHERING":
    case "OPEN_AUCTION":
    case "REDEEM_PRIZE":
      return noPayloadCommand(object, type);
    case "CHOOSE_YEAR_OF_PLENTY_RESOURCE":
    case "CHOOSE_MONOPOLY_RESOURCE": {
      exactObject(object, "message.command", ["type", "resource"]);
      return { type, resource: resourceAt(object.resource, "message.command.resource") };
    }
    case "MARITIME_TRADE": {
      exactObject(object, "message.command", ["type", "give", "receive"]);
      return {
        type,
        give: resourceAt(object.give, "message.command.give"),
        receive: resourceAt(object.receive, "message.command.receive")
      };
    }
    case "PUBLISH_PLAYER_TRADE": {
      exactObject(object, "message.command", ["type", "offered", "requested"]);
      return {
        type,
        offered: resourceMapAt(object.offered, "message.command.offered"),
        requested: resourceMapAt(object.requested, "message.command.requested")
      };
    }
    case "DISCARD_FOR_SEVEN":
    case "REDEEM_GATHERING": {
      exactObject(object, "message.command", ["type", "resources"]);
      return { type, resources: resourceMapAt(object.resources, "message.command.resources") };
    }
    case "TRANSFER_TOKENS": {
      exactObject(object, "message.command", ["type", "toPlayerId", "amount"]);
      return {
        type,
        toPlayerId: stringAt(object.toPlayerId, "message.command.toPlayerId"),
        amount: integerAt(object.amount, "message.command.amount")
      };
    }
    default:
      return fail("message.command.type", "is not an allowed network command");
  }
}

export function parseClientWebSocketMessage(text: string): ClientWebSocketMessage {
  const object = objectAt(parseWireJson(text), "message");
  const type = stringAt(object.type, "message.type");

  switch (type) {
    case "room.ready":
      exactObject(object, "message", ["type", "commandId", "expectedVersion", "ready"]);
      return { type, ...versionedFields(object), ready: booleanAt(object.ready, "message.ready") };
    case "room.start":
      exactObject(object, "message", ["type", "commandId", "expectedVersion"]);
      return { type, ...versionedFields(object) };
    case "match.command":
      exactObject(object, "message", ["type", "commandId", "expectedVersion", "command"]);
      return { type, ...versionedFields(object), command: parseNetworkMatchCommand(object.command) };
    case "auction.submitBid":
      exactObject(object, "message", ["type", "commandId", "expectedVersion", "amount"]);
      return {
        type,
        ...versionedFields(object),
        amount: integerAt(object.amount, "message.amount")
      };
    case "connection.heartbeat":
      exactObject(object, "message", ["type"]);
      return { type };
    default:
      return fail("message.type", "is unknown");
  }
}

function errorParamsAt(value: unknown, path: string): ProtocolErrorParams {
  const object = objectAt(value, path);
  if (Object.keys(object).length > 16) fail(path, "must contain at most 16 entries");
  const params: ProtocolErrorParams = {};
  for (const [key, entry] of Object.entries(object)) {
    stringAt(key, `${path} key`);
    if (typeof entry === "string") params[key] = stringAt(entry, `${path}.${key}`);
    else if (typeof entry === "number") params[key] = integerAt(entry, `${path}.${key}`);
    else if (typeof entry === "boolean") params[key] = entry;
    else fail(`${path}.${key}`, "must be a string, non-negative safe integer, or boolean");
  }
  return params;
}

function protocolErrorAt(value: unknown, path: string): ProtocolError {
  const object = exactObject(value, path, ["code", "params", "retryable"]);
  const code = literalAt(object.code, `${path}.code`, STABLE_ERROR_CODES);
  const retryable = booleanAt(object.retryable, `${path}.retryable`);
  if (retryable !== ERROR_DEFINITIONS[code].retryable) {
    fail(`${path}.retryable`, `must be ${ERROR_DEFINITIONS[code].retryable} for ${code}`);
  }
  return { code, params: errorParamsAt(object.params, `${path}.params`), retryable };
}

function projectionAt(value: unknown, path: string): ProjectionObject {
  return objectAt(value, path);
}

function presenceAt(value: unknown, path: string): PresenceEntry[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > 4) fail(path, "must contain at most 4 seats");
  return value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const object = exactObject(entry, entryPath, ["seatId", "connectionCount", "online"]);
    return {
      seatId: stringAt(object.seatId, `${entryPath}.seatId`),
      connectionCount: integerAt(object.connectionCount, `${entryPath}.connectionCount`),
      online: booleanAt(object.online, `${entryPath}.online`)
    };
  });
}

function parseRoomSnapshot(object: JsonObject): RoomSnapshotMessage {
  exactObject(
    object,
    "message",
    [
      "type",
      "schemaVersion",
      "roomVersion",
      "lifecycle",
      "publicState",
      "privateState",
      "allowedActions",
      "presence"
    ],
    ["acknowledgedCommandId"]
  );
  if (object.schemaVersion !== PROTOCOL_SCHEMA_VERSION) {
    fail("message.schemaVersion", `must equal ${PROTOCOL_SCHEMA_VERSION}`);
  }
  const snapshot: RoomSnapshotMessage = {
    type: "room.snapshot",
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    roomVersion: integerAt(object.roomVersion, "message.roomVersion"),
    lifecycle: literalAt(object.lifecycle, "message.lifecycle", [
      "lobby",
      "playing",
      "finished",
      "expired"
    ]),
    publicState: projectionAt(object.publicState, "message.publicState"),
    privateState: projectionAt(object.privateState, "message.privateState"),
    allowedActions: projectionAt(object.allowedActions, "message.allowedActions"),
    presence: presenceAt(object.presence, "message.presence")
  };
  if (object.acknowledgedCommandId !== undefined) {
    snapshot.acknowledgedCommandId = commandIdAt(
      object.acknowledgedCommandId,
      "message.acknowledgedCommandId"
    );
  }
  return snapshot;
}

export function parseServerWebSocketMessage(text: string): ServerWebSocketMessage {
  const object = objectAt(parseWireJson(text), "message");
  const type = stringAt(object.type, "message.type");

  switch (type) {
    case "room.snapshot":
      return parseRoomSnapshot(object);
    case "command.rejected": {
      exactObject(object, "message", ["type", "commandId", "error"], ["snapshot"]);
      const error = protocolErrorAt(object.error, "message.error");
      if (error.code === "VERSION_CONFLICT" && object.snapshot === undefined) {
        fail("message.snapshot", "is required for VERSION_CONFLICT");
      }
      const message: Extract<ServerWebSocketMessage, { type: "command.rejected" }> = {
        type,
        commandId: commandIdAt(object.commandId, "message.commandId"),
        error
      };
      if (object.snapshot !== undefined) {
        message.snapshot = projectionAt(object.snapshot, "message.snapshot");
      }
      return message;
    }
    case "presence.changed":
      exactObject(object, "message", ["type", "presence"]);
      return { type, presence: presenceAt(object.presence, "message.presence") };
    case "room.expired": {
      exactObject(object, "message", ["type", "error"]);
      const error = protocolErrorAt(object.error, "message.error");
      if (error.code !== "ROOM_EXPIRED") fail("message.error.code", "must be ROOM_EXPIRED");
      return { type, error };
    }
    case "protocol.incompatible": {
      exactObject(object, "message", ["type", "error"]);
      const error = protocolErrorAt(object.error, "message.error");
      if (error.code !== "PROTOCOL_INCOMPATIBLE") {
        fail("message.error.code", "must be PROTOCOL_INCOMPATIBLE");
      }
      if (error.params.expected !== PROTOCOL_SCHEMA_VERSION) {
        fail("message.error.params.expected", `must equal ${PROTOCOL_SCHEMA_VERSION}`);
      }
      return { type, error };
    }
    default:
      return fail("message.type", "is unknown");
  }
}
