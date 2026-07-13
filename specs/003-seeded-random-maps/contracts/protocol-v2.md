# Contract: Online Protocol v2 Map Seed and Restart

Status: Planned
Schema version: 2

## Client Restart Message

```json
{
  "type": "room.restart",
  "commandId": "7e47d6b5-86a0-4f2a-a6b9-a6c09028baf1",
  "expectedVersion": 42,
  "mode": "fresh"
}
```

`mode` is `fresh` or `sameMap`. Exact-object validation rejects every additional field, including `seed`, `playerId`, `seatId`, and host claims.

## Snapshot Additions and Replacements

Playing/finished `publicState.game` requires:

```json
{
  "mapSeed": "M1-0123456789ABCDEF"
}
```

`boardLayout` is removed. Board content is reconstructed from `mapSeed` by the shared generator.

Every caller's `privateState` requires:

```json
{
  "canRestartMatch": true
}
```

The value is true only for the authenticated host seat during `playing` or `finished`. It is caller-specific and must not be copied into public state.

## Authority and Ordering

`room.restart` uses the same processing sequence as existing versioned commands:

1. Parse schema and exact message shape.
2. Authenticate the attached seat.
3. Reject duplicate or rate-limited attempts according to existing policy.
4. Compare `expectedVersion` to the latest stored room.
5. Require the latest `hostSeatId` to equal the authenticated seat ID.
6. Create a complete setup match for `fresh` or `sameMap`.
7. Validate and preflight every recipient projection.
8. Persist one room replacement and record idempotency.
9. Broadcast caller-specific schema-v2 snapshots.

A stale restart receives `VERSION_CONFLICT` with the latest snapshot. A non-host restart receives `COMMAND_NOT_ALLOWED`. A duplicate accepted command returns the committed snapshot without a second reset.

## Atomicity

If seed creation, match creation, validation, storage migration, or projection preflight throws:

- the previous room version and match remain authoritative;
- no partial setup or seed is written;
- no accepted snapshot is broadcast;
- the initiator receives the existing safe rejection behavior.

## Compatibility

Clients expecting schema 1 reject schema 2 and enter the existing refresh path. Servers receiving incompatible connection behavior emit `protocol.incompatible` with `params.expected = 2` and close using the existing incompatible-protocol close code.

No mixed schema snapshot is valid.
