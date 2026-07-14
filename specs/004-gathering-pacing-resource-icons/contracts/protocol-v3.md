# Online Protocol Contract v3: Gathering Cooldown

Date: 2026-07-14
Supersedes: schema version 2 for SPA/Worker communication and persisted rooms

## Version Rule

Every versioned request and server snapshot uses schema version `3`. A protocol-v2 browser follows the existing incompatible-client refresh/recovery path; the Worker does not accept a mixed v2/v3 command stream.

## Start Gathering Request

The only valid public command body is:

```json
{
  "type": "match.command",
  "commandId": "cmd-123",
  "expectedVersion": 27,
  "command": {
    "type": "START_GATHERING"
  }
}
```

Rejected command bodies include any additional actor or cooldown field:

```json
{ "type": "START_GATHERING", "playerId": "p2" }
{ "type": "START_GATHERING", "seatId": "seat-2" }
{ "type": "START_GATHERING", "remainingTurns": 0 }
{ "type": "START_GATHERING", "availableAtTurn": 40 }
```

The Worker derives `playerId` from the authenticated seat after parsing and before calling the shared domain transition.

## Public Snapshot Addition

The gathering projection contains one required public remaining value:

```json
{
  "guild": {
    "tradeSlots": [],
    "usedTradePlayerIds": [],
    "gathering": {
      "phase": "idle",
      "auctionRound": 1,
      "auctionResults": [],
      "cooldownRemaining": 3
    }
  }
}
```

Rules:

- `cooldownRemaining` is an integer in `[0, 2n]`.
- It is identical for every recipient of the same room version.
- Internal `availableAtTurn` and `displayDuration` never appear in public or private projection objects.

## Caller-specific Availability

When the table cooldown is the highest-priority blocker:

```json
{
  "enabled": false,
  "disabledReason": {
    "code": "GATHERING_COOLDOWN",
    "params": {
      "remainingTurns": 3
    }
  },
  "targets": []
}
```

When the value is zero, only the current authenticated player in a clean normal action phase receives an enabled start action. Other callers receive their existing caller-specific authorization/phase reason; they do not receive a separate cooldown.

## Accepted Command Ordering

An accepted `START_GATHERING` uses the existing serialized pipeline:

1. authenticate connection ticket/seat;
2. parse exact protocol-v3 command;
3. enforce rate, duplicate command id, and `expectedVersion` checks;
4. inject authenticated `playerId`;
5. execute shared domain transition;
6. construct and validate every recipient-specific v3 projection;
7. persist room version `+1`;
8. acknowledge/broadcast snapshots.

A rejected command performs no storage write, room-version increment, acknowledgement-as-accepted, or broadcast.

## Persisted Schema v3

Persisted rooms use `schemaVersion: 3` and store `matchState.guild.gatheringCooldown`. The public protocol version and persisted schema version intentionally advance together for this release.

Migration accepts valid stored schema-v2 rooms and the already-supported schema-v1 fixed-map rooms. It validates the complete v3 candidate before replacing storage.
