# Data Model: Gathering Pacing, Setup Grants, and Resource Iconography

Date: 2026-07-14
Protocol/storage target: version 3

## Domain Types

### GatheringCooldownWindow

```ts
interface GatheringCooldownWindow {
  availableAtTurn: number;
  displayDuration: number;
}
```

Validation:

- Both fields are finite safe integers.
- `availableAtTurn >= 1`.
- `displayDuration` equals either `n` or `2n` for the current match player count.
- The remaining value is derived and clamped; it is never persisted separately.

Derived value:

```ts
remaining = Math.min(
  window.displayDuration,
  Math.max(0, window.availableAtTurn - game.turn)
)
```

### CommerceGuildState v3

```ts
interface CommerceGuildState {
  tradeSlots: TradeSlot[];
  usedTradePlayerIds: PlayerId[];
  gathering: GatheringState;
  gatheringCooldown: GatheringCooldownWindow;
}
```

Changes from v2:

- Adds required `gatheringCooldown`.
- Removes optional `lastAutoGatheringRound`.
- Does not add a player-keyed cooldown map.

### Gathering start command

```ts
type MatchCommand =
  | { type: "START_GATHERING"; playerId: PlayerId }
  | /* existing commands */;
```

The domain actor is required. The online wire representation omits it and the Worker injects it.

### GatheringStartBlocker

```ts
type GatheringStartBlocker =
  | "notPlaying"
  | "unresolvedAction"
  | "notCurrentPlayer"
  | "pendingTrade"
  | "gatheringInProgress"
  | "cooldown";
```

The blocker is derived from `GameState`, `CommerceGuildState`, caller `playerId`, and whether a player trade is pending. It is not stored.

## State Transitions

### New or restarted match

For player count `n` and first formal game turn `t`:

```text
availableAtTurn = t + 2n
displayDuration = 2n
```

Setup placement leaves `game.turn` unchanged, so the visible value remains `2n` until formal play.

### Start gathering

Preconditions:

- game phase is `playing`;
- turn state is `action`;
- caller is `game.activePlayerId`;
- no pending player trade;
- gathering phase is `idle`;
- derived remaining cooldown is zero.

For current turn `t` and player count `n`:

```text
gathering.phase = redemption
availableAtTurn = t + n + 1
displayDuration = n
```

The transition replaces the previous table window and resets gathering redemption/auction working state.

### End turn

- Normal `END_TURN` advances `game.turn` through the existing turn transition.
- No cooldown counter is mutated.
- If the gathering phase is `complete`, the same accepted end-turn transition changes the phase to `idle` while retaining the last auction result and cooldown window.
- Setup roads and settlements do not advance the target or current turn.

### Second setup settlement grant

Transient grant:

```ts
type SetupResourceGrant = ResourceMap;
```

Derivation:

- Start from all zeros.
- For each board hex containing the placed vertex, add one to `hex.resource` when non-null.
- Repeated resources add repeatedly; desert contributes nothing.

Atomic mutation set:

- append setup settlement;
- credit player resource map;
- debit bank resource map;
- move setup stage to `road` and record `pendingSettlement`.

If any bank entry is below the complete grant, none of these fields change.

## Public Online Projection v3

### PublicGuildView

```ts
interface PublicGuildView {
  tradeSlots: PublicTradeSlot[];
  usedTradePlayerIds: PlayerId[];
  gathering: {
    phase: GatheringPhase;
    auctionRound: number;
    auctionResults: PublicBlindBoxOutcomeView[];
    cooldownRemaining: number;
    lastAuctionResult?: PublicAuctionResultView;
  };
}
```

Rules:

- `cooldownRemaining` is a non-negative safe integer no greater than `2n`.
- Every recipient receives the same value for a room version.
- `availableAtTurn` and `displayDuration` are not projected.

### Allowed actions

`allowedActions.commerce.startGathering` remains caller-specific because current-player and action-phase facts differ by caller. A cooldown denial uses:

```ts
{
  enabled: false,
  disabledReason: {
    code: "GATHERING_COOLDOWN",
    params: { remainingTurns: number }
  },
  targets: []
}
```

There is no private cooldown value in `PrivateSeatState`.

## Persisted Room v3

```ts
interface PersistedRoom {
  schemaVersion: 3;
  // existing room fields
  matchState?: MatchState; // contains CommerceGuildState v3
}
```

### v2 migration table

| v2 lifecycle/gathering | v3 result |
| --- | --- |
| lobby, no match | schema becomes 3; no match or cooldown fabricated |
| playing/finished + idle | preserve match; add `2n` window anchored at `game.turn` |
| playing/finished + complete | preserve result; add `2n` window anchored at `game.turn` |
| playing/finished + redemption | preserve live gathering; add post-gathering `n` window excluding current turn |
| playing/finished + auction | preserve live gathering and sealed bids; add post-gathering `n` window excluding current turn |

Every migrated match removes `lastAutoGatheringRound`. The complete v3 candidate must pass room validation before one replacement write.

## Presentation Types

### Resource icon mapping

```ts
const resourceIcons: Record<Resource, LucideIcon>;
```

This mapping is the only production resource-to-icon map.

### ResourceBadge inputs

```ts
interface ResourceBadgeProps {
  resource: Resource;
  quantity: number;
  compact?: boolean;
  showZero?: boolean;
}
```

Presentation invariants:

- Icon silhouette and semantic resource color are both present.
- Quantity is visible text.
- Complete localized resource name is available through `aria-label`/`title` or equivalent hidden text.
- Decimal statistics use the same quantity formatter without rounding to integers.
- Color is never the only resource identifier.

### Board SVG

- Non-desert hex: one resource icon and optional existing dice token.
- Desert hex: no resource icon.
- Resource port: ratio text plus resource icon.
- Generic port: ratio text only.
- Enclosing hex/port group retains localized accessible labeling.
- Visible terrain word and abbreviation nodes are absent.
