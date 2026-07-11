# Contract: Online Room HTTP and WebSocket Protocol

Protocol schema version: `1`

## Common Rules

- Production endpoints are same-origin under `/api/rooms`.
- Request and response bodies use UTF-8 JSON.
- HTTP bodies and WebSocket text messages are limited to 16 KiB.
- Every JSON response includes `content-type: application/json; charset=utf-8`.
- Unknown message types, missing required fields, extra actor identity, fractional counts, and out-of-range values are rejected.
- Client-facing errors use a stable `code`, translation `params`, and `retryable` flag; internal stacks are never returned.

## HTTP Endpoints

### GET `/api/health`

Success `200`:

```json
{ "ok": true, "schemaVersion": 1 }
```

This endpoint exposes no room or deployment-secret data.

### POST `/api/rooms`

Request:

```json
{ "nickname": "Voyage1969" }
```

Success `201`:

```json
{
  "roomCode": "7KMPQX",
  "seatId": "seat_uuid",
  "seatToken": "base64url_secret"
}
```

Errors: `RULE_VIOLATION`, `INTERNAL_ERROR`.

The Worker retries a generated room-code collision with a fresh code up to eight times. It never attaches a new host to an already initialized room.

### POST `/api/rooms/{roomCode}/join`

Request:

```json
{ "nickname": "Kay" }
```

Success `201`: same shape as create.

Errors: `ROOM_NOT_FOUND`, `ROOM_FULL`, `ROOM_ALREADY_STARTED`, `RULE_VIOLATION`.

### DELETE `/api/rooms/{roomCode}/seats/{seatId}`

Header:

```text
Authorization: Bearer <seatToken>
```

Success `204`: no body. Only valid during lobby. Host transfer is included in the mutation.

Errors: `ROOM_NOT_FOUND`, `SEAT_TOKEN_INVALID`, `COMMAND_NOT_ALLOWED`, `RATE_LIMITED`.

### POST `/api/rooms/{roomCode}/connection-ticket`

Header:

```text
Authorization: Bearer <seatToken>
```

Success `201`:

```json
{ "ticket": "base64url_one_time_ticket", "expiresInMs": 30000 }
```

Errors: `ROOM_NOT_FOUND`, `SEAT_TOKEN_INVALID`, `ROOM_EXPIRED`, `RATE_LIMITED`.

### GET `/api/rooms/{roomCode}/connect?ticket={oneTimeTicket}`

Requires `Upgrade: websocket`. The ticket is consumed atomically. Success is HTTP `101`; failure is a normal JSON error response.

Errors: `ROOM_NOT_FOUND`, `CONNECTION_TICKET_EXPIRED`, `ROOM_EXPIRED`, `PROTOCOL_INCOMPATIBLE`.

## Client WebSocket Messages

### Ready

```json
{ "type": "room.ready", "commandId": "uuid", "expectedVersion": 2, "ready": true }
```

### Start

```json
{ "type": "room.start", "commandId": "uuid", "expectedVersion": 8 }
```

### Match Command

```json
{
  "type": "match.command",
  "commandId": "uuid",
  "expectedVersion": 15,
  "command": { "type": "BUILD_ROAD", "edgeId": "edge-12" }
}
```

The command union mirrors shared gameplay commands but omits the acting `playerId`, injected random values, and full multi-player bid maps.

### Submit Sealed Bid

```json
{
  "type": "auction.submitBid",
  "commandId": "uuid",
  "expectedVersion": 31,
  "amount": 2
}
```

`amount` is a whole number greater than or equal to zero and no greater than the caller's current guild tokens.

### Heartbeat

```json
{ "type": "connection.heartbeat" }
```

Heartbeat can use Durable Object WebSocket auto-response and does not change room version or retention by itself. Active connections already defer expiry.

## Server WebSocket Messages

### Room Snapshot

```json
{
  "type": "room.snapshot",
  "schemaVersion": 1,
  "roomVersion": 32,
  "lifecycle": "playing",
  "publicState": {},
  "privateState": {},
  "allowedActions": {},
  "presence": [],
  "acknowledgedCommandId": "uuid"
}
```

The actual public/private/allowed-action properties are defined in `data-model.md` and TypeScript source. A separate projection is created for every seat.

### Command Rejected

```json
{
  "type": "command.rejected",
  "commandId": "uuid",
  "error": {
    "code": "VERSION_CONFLICT",
    "params": {},
    "retryable": true
  },
  "snapshot": {}
}
```

Only `VERSION_CONFLICT` is required to include the latest caller snapshot. A rule violation leaves the current client snapshot mounted.

### Presence Changed

```json
{
  "type": "presence.changed",
  "presence": [
    { "seatId": "seat_uuid", "connectionCount": 1, "online": true }
  ]
}
```

Presence does not increment room version.

### Terminal Messages

```json
{ "type": "room.expired", "error": { "code": "ROOM_EXPIRED", "params": {}, "retryable": false } }
```

```json
{
  "type": "protocol.incompatible",
  "error": { "code": "PROTOCOL_INCOMPATIBLE", "params": { "expected": 1 }, "retryable": false }
}
```

The server closes the socket after either message.

## Stable Error Codes

| Code | HTTP equivalent | Retryable |
|---|---:|---:|
| `ROOM_NOT_FOUND` | 404 | No |
| `ROOM_FULL` | 409 | No |
| `ROOM_ALREADY_STARTED` | 409 | No |
| `SEAT_TOKEN_INVALID` | 401 | No |
| `CONNECTION_TICKET_EXPIRED` | 401 | Yes |
| `VERSION_CONFLICT` | 409 | Yes after user reconfirmation |
| `COMMAND_NOT_ALLOWED` | 403 | No until state changes |
| `RULE_VIOLATION` | 422 | No until input changes |
| `RATE_LIMITED` | 429 | Yes |
| `ROOM_EXPIRED` | 410 | No |
| `PROTOCOL_INCOMPATIBLE` | 426 | No until refresh/deploy alignment |
| `INTERNAL_ERROR` | 500 | Yes |

## Privacy Contract

- No server message contains a seat token, token hash, connection ticket, or ticket hash.
- A seat receives full resource maps and development-card identities only for its mapped player.
- Opponent card data is represented only as counts.
- Hidden victory-point contribution is omitted from opponent-visible score before game end.
- Before an auction resolves, only submitted seat IDs and the caller's own amount are visible.
- After resolution, only winner, winning amount, and sanitized outcome are public; losing amounts remain absent.
- If the outcome is a development card, only the recipient projection contains the card kind.
