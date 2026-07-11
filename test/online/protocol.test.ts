import { describe, expect, it } from "vitest";

import {
  ERROR_DEFINITIONS,
  MAX_NICKNAME_CODE_POINTS,
  MAX_WIRE_BYTES,
  MAX_WIRE_INTEGER,
  MAX_WIRE_STRING_CODE_POINTS,
  PROTOCOL_SCHEMA_VERSION,
  ProtocolValidationError,
  STABLE_ERROR_CODES,
  parseConnectionTicketResponse,
  parseHealthResponse,
  parseNicknameRequest,
  parseSeatCredentialsResponse,
  parseClientWebSocketMessage,
  parseServerWebSocketMessage,
  type OnlineMatchCommand
} from "../../src/online/protocol";

const commandId = "123e4567-e89b-42d3-a456-426614174000";

function wire(value: unknown): string {
  return JSON.stringify(value);
}

describe("HTTP protocol bodies", () => {
  it("parses every JSON HTTP body shape", () => {
    expect(parseHealthResponse(wire({ ok: true, schemaVersion: 1 }))).toEqual({
      ok: true,
      schemaVersion: PROTOCOL_SCHEMA_VERSION
    });
    expect(parseNicknameRequest(wire({ nickname: "  Kay  " }))).toEqual({ nickname: "Kay" });
    expect(
      parseSeatCredentialsResponse(
        wire({ roomCode: "7KMPQX", seatId: "seat_uuid", seatToken: "base64url_secret" })
      )
    ).toEqual({ roomCode: "7KMPQX", seatId: "seat_uuid", seatToken: "base64url_secret" });
    expect(
      parseConnectionTicketResponse(
        wire({ ticket: "base64url_one_time_ticket", expiresInMs: 30_000 })
      )
    ).toEqual({ ticket: "base64url_one_time_ticket", expiresInMs: 30_000 });
  });

  it("rejects extra fields and invalid bounded HTTP values", () => {
    expect(() => parseNicknameRequest(wire({ nickname: "", admin: true }))).toThrow(
      ProtocolValidationError
    );
    expect(() => parseNicknameRequest(wire({ nickname: "x".repeat(21) }))).toThrow(
      "nickname"
    );
    expect(() =>
      parseConnectionTicketResponse(wire({ ticket: "ticket", expiresInMs: 1.5 }))
    ).toThrow("expiresInMs");
    expect(() => parseHealthResponse(wire({ ok: true, schemaVersion: 2 }))).toThrow(
      "schemaVersion"
    );
  });

  it("applies the approved Unicode code-point string bounds", () => {
    expect(MAX_NICKNAME_CODE_POINTS).toBe(20);
    expect(MAX_WIRE_STRING_CODE_POINTS).toBe(128);
    expect(parseNicknameRequest(wire({ nickname: "界".repeat(20) }))).toEqual({
      nickname: "界".repeat(20)
    });
    expect(() => parseNicknameRequest(wire({ nickname: "界".repeat(21) }))).toThrow("nickname");
    expect(
      parseSeatCredentialsResponse(
        wire({ roomCode: "R".repeat(128), seatId: "S", seatToken: "T" })
      ).roomCode
    ).toHaveLength(128);
    expect(() =>
      parseSeatCredentialsResponse(
        wire({ roomCode: "R".repeat(129), seatId: "S", seatToken: "T" })
      )
    ).toThrow("roomCode");
  });
});

describe("wire size boundary", () => {
  it("accepts exactly 16 KiB and rejects one additional UTF-8 byte", () => {
    const prefix = '{"type":"connection.heartbeat"}';
    const exact = `${prefix}${" ".repeat(MAX_WIRE_BYTES - prefix.length)}`;
    expect(parseClientWebSocketMessage(exact)).toEqual({ type: "connection.heartbeat" });
    expect(() => parseClientWebSocketMessage(`${exact} `)).toThrow("16 KiB");
  });

  it("measures UTF-8 bytes rather than JavaScript code units", () => {
    const oversized = wire({ nickname: "界".repeat(5_500) });
    expect(oversized.length).toBeLessThan(MAX_WIRE_BYTES);
    expect(() => parseNicknameRequest(oversized)).toThrow("16 KiB");
  });
});

describe("client WebSocket messages", () => {
  it.each([
    [{ type: "room.ready", commandId, expectedVersion: 2, ready: true }],
    [{ type: "room.start", commandId, expectedVersion: 8 }],
    [
      {
        type: "match.command",
        commandId,
        expectedVersion: 15,
        command: { type: "BUILD_ROAD", edgeId: "edge-12" }
      }
    ],
    [{ type: "auction.submitBid", commandId, expectedVersion: 31, amount: 2 }],
    [{ type: "connection.heartbeat" }]
  ])("parses client discriminant %#", (message) => {
    expect(parseClientWebSocketMessage(wire(message))).toEqual(message);
  });

  it.each([
    { type: "PLACE_SETUP_SETTLEMENT", vertexId: "vertex-1" },
    { type: "PLACE_SETUP_ROAD", edgeId: "edge-1" },
    { type: "ROLL_DICE" },
    { type: "END_TURN" },
    { type: "BUILD_ROAD", edgeId: "edge-1" },
    { type: "BUILD_SETTLEMENT", vertexId: "vertex-1" },
    { type: "BUILD_CITY", buildingId: "building-1" },
    { type: "BUY_DEVELOPMENT_CARD" },
    { type: "PLAY_DEVELOPMENT_CARD", cardId: "card-1" },
    { type: "PLAY_KNIGHT_CARD", cardId: "card-1" },
    { type: "PLACE_FREE_ROAD", edgeId: "edge-1" },
    { type: "CHOOSE_YEAR_OF_PLENTY_RESOURCE", resource: "wood" },
    { type: "CHOOSE_MONOPOLY_RESOURCE", resource: "ore" },
    { type: "MARITIME_TRADE", give: "wood", receive: "brick" },
    {
      type: "PUBLISH_PLAYER_TRADE",
      offered: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
      requested: { wood: 0, brick: 1, wool: 0, grain: 0, ore: 0 }
    },
    { type: "CANCEL_PLAYER_TRADE" },
    { type: "ACCEPT_PLAYER_TRADE" },
    { type: "DISCARD_FOR_SEVEN", resources: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 } },
    { type: "PLACE_ROBBER", hexId: "hex-1" },
    { type: "STEAL_ROBBER_RESOURCE", victimId: "player-2" },
    { type: "COMPLETE_TRADE_SLOT", slotId: "slot-1" },
    { type: "TRANSFER_TOKENS", toPlayerId: "player-2", amount: 1 },
    { type: "START_GATHERING" },
    { type: "OPEN_AUCTION" },
    { type: "REDEEM_GATHERING", resources: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 } },
    { type: "REDEEM_PRIZE" }
  ])("parses actorless match command $type", (command) => {
    const message = { type: "match.command", commandId, expectedVersion: 0, command };
    expect(parseClientWebSocketMessage(wire(message))).toEqual(message);
  });

  it("requires canonical UUID command IDs and non-negative integer versions", () => {
    expect(MAX_WIRE_INTEGER).toBe(Number.MAX_SAFE_INTEGER);
    expect(
      parseClientWebSocketMessage(
        wire({ type: "room.start", commandId, expectedVersion: MAX_WIRE_INTEGER })
      )
    ).toEqual({ type: "room.start", commandId, expectedVersion: MAX_WIRE_INTEGER });
    for (const invalidId of ["uuid", "123e4567-e89b-42d3-a456-42661417400", 42]) {
      expect(() =>
        parseClientWebSocketMessage(
          wire({ type: "room.start", commandId: invalidId, expectedVersion: 0 })
        )
      ).toThrow("commandId");
    }
    for (const invalidVersion of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
      expect(() =>
        parseClientWebSocketMessage(
          wire({ type: "room.start", commandId, expectedVersion: invalidVersion })
        )
      ).toThrow("expectedVersion");
    }
  });

  it("accepts only non-negative whole bid and resource amounts", () => {
    for (const amount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "2"]) {
      expect(() =>
        parseClientWebSocketMessage(
          wire({ type: "auction.submitBid", commandId, expectedVersion: 0, amount })
        )
      ).toThrow("amount");
    }
    expect(() =>
      parseClientWebSocketMessage(
        wire({
          type: "match.command",
          commandId,
          expectedVersion: 0,
          command: {
            type: "DISCARD_FOR_SEVEN",
            resources: { wood: 0.5, brick: 0, wool: 0, grain: 0, ore: 0 }
          }
        })
      )
    ).toThrow("resources.wood");
  });

  it("accepts bounded partial gathering costs without filling missing resources", () => {
    const partialCommand: OnlineMatchCommand = {
      type: "REDEEM_GATHERING",
      resources: { wood: 1 }
    };
    const partialMessage = {
      type: "match.command",
      commandId,
      expectedVersion: 0,
      command: partialCommand
    };
    expect(parseClientWebSocketMessage(wire(partialMessage))).toEqual(partialMessage);

    for (const resources of [{}, { wood: 0 }]) {
      const structurallySafeMessage = {
        ...partialMessage,
        command: { type: "REDEEM_GATHERING", resources }
      };
      expect(parseClientWebSocketMessage(wire(structurallySafeMessage))).toEqual(
        structurallySafeMessage
      );
    }

    const fullResources = { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 };
    const fullMessage = {
      ...partialMessage,
      command: { type: "REDEEM_GATHERING", resources: fullResources }
    };
    expect(parseClientWebSocketMessage(wire(fullMessage))).toEqual(fullMessage);

    for (const resources of [
      { gold: 1 },
      { wood: -1 },
      { wood: 0.5 },
      { wood: Number.MAX_SAFE_INTEGER + 1 },
      { wood: "1" },
      { wood: null }
    ]) {
      expect(() =>
        parseClientWebSocketMessage(
          wire({
            type: "match.command",
            commandId,
            expectedVersion: 0,
            command: { type: "REDEEM_GATHERING", resources }
          })
        )
      ).toThrow(ProtocolValidationError);
    }

    expect(() =>
      parseClientWebSocketMessage(
        wire({
          type: "match.command",
          commandId,
          expectedVersion: 0,
          command: {
            type: "PUBLISH_PLAYER_TRADE",
            offered: { wood: 1 },
            requested: { wood: 0, brick: 1, wool: 0, grain: 0, ore: 0 }
          }
        })
      )
    ).toThrow("message.command.offered.brick is required");
  });

  it.each([
    { type: "ROLL_DICE", playerId: "attacker" },
    { type: "ROLL_DICE", dice: { first: 6, second: 6, total: 12 } },
    { type: "ROLL_DICE", random: "controlled" },
    { type: "RESOLVE_AUCTION", bids: { "player-1": 2, "player-2": 1 } },
    { type: "START_NEW_GAME" },
    { type: "TRANSFER_TOKENS", fromPlayerId: "attacker", toPlayerId: "player-2", amount: 1 }
  ])("rejects privileged match payload %#", (command) => {
    expect(() =>
      parseClientWebSocketMessage(
        wire({ type: "match.command", commandId, expectedVersion: 0, command })
      )
    ).toThrow(ProtocolValidationError);
  });

  it("rejects unknown types, missing fields, extra fields, and malformed objects", () => {
    const invalid = [
      { type: "room.unknown" },
      { type: "room.ready", commandId, expectedVersion: 0 },
      { type: "connection.heartbeat", playerId: "attacker" },
      { type: "room.start", commandId, expectedVersion: 0, extra: true },
      { type: "match.command", commandId, expectedVersion: 0, command: [] },
      null,
      []
    ];
    for (const message of invalid) {
      expect(() => parseClientWebSocketMessage(wire(message))).toThrow(ProtocolValidationError);
    }
    expect(() => parseClientWebSocketMessage("not json")).toThrow(ProtocolValidationError);
  });
});

describe("server WebSocket messages", () => {
  const retryableError = { code: "VERSION_CONFLICT", params: {}, retryable: true };
  const expiredError = { code: "ROOM_EXPIRED", params: {}, retryable: false };
  const incompatibleError = {
    code: "PROTOCOL_INCOMPATIBLE",
    params: { expected: 1 },
    retryable: false
  };

  it.each([
    [
      {
        type: "room.snapshot",
        schemaVersion: 1,
        roomVersion: 32,
        lifecycle: "playing",
        publicState: {},
        privateState: {},
        allowedActions: {},
        presence: [],
        acknowledgedCommandId: commandId
      }
    ],
    [
      {
        type: "command.rejected",
        commandId,
        error: retryableError,
        snapshot: {}
      }
    ],
    [
      {
        type: "presence.changed",
        presence: [{ seatId: "seat_uuid", connectionCount: 1, online: true }]
      }
    ],
    [{ type: "room.expired", error: expiredError }],
    [{ type: "protocol.incompatible", error: incompatibleError }]
  ])("parses server discriminant %#", (message) => {
    expect(parseServerWebSocketMessage(wire(message))).toEqual(message);
  });

  it("requires a snapshot for version conflicts", () => {
    expect(() =>
      parseServerWebSocketMessage(
        wire({ type: "command.rejected", commandId, error: retryableError })
      )
    ).toThrow("snapshot");
  });

  it("rejects unknown, extra, and malformed server fields", () => {
    const invalid = [
      { type: "server.unknown" },
      { type: "room.expired", error: expiredError, seatToken: "secret" },
      {
        type: "presence.changed",
        presence: [{ seatId: "seat", connectionCount: -1, online: true }]
      },
      {
        type: "room.snapshot",
        schemaVersion: 1,
        roomVersion: 0,
        lifecycle: "unknown",
        publicState: {},
        privateState: {},
        allowedActions: {},
        presence: []
      }
    ];
    for (const message of invalid) {
      expect(() => parseServerWebSocketMessage(wire(message))).toThrow(ProtocolValidationError);
    }
  });
});

describe("stable protocol errors", () => {
  it("publishes every approved code with its stable HTTP status and retryability", () => {
    expect(STABLE_ERROR_CODES).toEqual([
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
    ]);
    expect(ERROR_DEFINITIONS).toEqual({
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
    });
  });

  it("rejects unknown codes and retryability that disagrees with the stable definition", () => {
    expect(() =>
      parseServerWebSocketMessage(
        wire({
          type: "room.expired",
          error: { code: "UNKNOWN", params: {}, retryable: false }
        })
      )
    ).toThrow("error.code");
    expect(() =>
      parseServerWebSocketMessage(
        wire({
          type: "room.expired",
          error: { code: "ROOM_EXPIRED", params: {}, retryable: true }
        })
      )
    ).toThrow("error.retryable");
  });
});
