# Data Model: Core Rule Integrity Hardening

Created: 2026-07-10
Feature: 001-catan-imitation
Requirements: CR-001 through CR-030

## Turn State

```ts
type TurnPhase =
  | "awaitingRoll"
  | "awaitingDiscards"
  | "awaitingRobberPlacement"
  | "awaitingRobberVictim"
  | "action";

interface PendingRobber {
  source: "seven" | "knight";
  resumePhase: "awaitingRoll" | "action";
  targetHexId?: HexId;
  eligibleVictimIds: PlayerId[];
}

interface TurnState {
  phase: TurnPhase;
  pendingDiscards: Partial<Record<PlayerId, number>>;
  pendingRobber?: PendingRobber;
}
```

`GameState` owns one `turnState`. Setup games do not accept normal turn commands; when setup completes, the first player receives a fresh `awaitingRoll` state.

## State Invariants

- `awaitingRoll`: no pending discards or robber; active player may roll or play a legal knight.
- `awaitingDiscards`: at least one positive discard obligation exists; no robber target exists yet.
- `awaitingRobberPlacement`: discard obligations are empty and `pendingRobber` records a source and resume phase.
- `awaitingRobberVictim`: `pendingRobber.targetHexId` exists and `eligibleVictimIds` contains at least one opponent with resources adjacent to that hex.
- `action`: no pending discard or robber data; active player may use normal actions or end the turn.

## Command Additions and Changes

| Command | Contract change | Legal phase |
|---|---|---|
| `ROLL_DICE` | Add `playerId`; retain optional deterministic dice tuple | `awaitingRoll` |
| `DISCARD_FOR_SEVEN` | New command with `playerId` and complete `ResourceMap` | `awaitingDiscards` while that player owes cards |
| `PLAY_KNIGHT_CARD` | Remove immediate target hex; retain `playerId` and `cardId` | `awaitingRoll` or `action` |
| `PLACE_ROBBER` | Add `playerId`; retain `hexId` | `awaitingRobberPlacement` for the active player |
| `STEAL_ROBBER_RESOURCE` | New command with active `playerId` and selected `victimId` | `awaitingRobberVictim` |
| `END_TURN` | Add `playerId` | `action` |

Existing build, development-card purchase, maritime trade, Commerce Guild slot trade, and token-transfer commands already carry actor ids and become subject to the shared active-player/action-phase gate. Gathering redemption and auction bid collection continue to follow Commerce Guild phase rules rather than the active-turn gate.

## Seven-Roll Discard Submission

- The required count is `floor(total resources / 2)` for each player above seven cards at roll time.
- A submission is a complete `ResourceMap` of finite non-negative integers.
- The submitted total equals the recorded requirement and does not exceed the player's holdings by resource.
- Accepted resources move from that player to the bank and remove that player's pending obligation.

## Robber Eligibility

- The destination hex exists and differs from the current robber hex.
- Eligible victims exclude the active player.
- A victim owns at least one building on a destination vertex and holds at least one resource card.
- The selected victim must belong to the recorded eligible set; one resource is selected with the injected random source.

## Longest Road Ownership

The calculated per-player lengths produce one of four award states:

| Condition | Owner result |
|---|---|
| Maximum below 5 | none |
| Current owner shares maximum at least 5 | current owner |
| One player uniquely leads at least 5 | unique leader |
| Current owner is not tied for maximum and multiple challengers share maximum | none |

## Commerce Resource Ledger

Each operation uses immutable transfers between player resources and `game.bank.resources`:

- Trade slot: player to bank.
- Gathering redemption: bank to player; insufficient stock rejects the whole requested transfer.
- Resource blind box: bank to player; each resource is capped independently by current bank stock and the recorded outcome contains actual awarded counts.

All quantities are finite whole numbers. Token transfers require a positive amount; zero auction entries may represent no bid, while a winning bid must be positive.

## P2 Development Effect State

```ts
type TurnPhase =
  | "awaitingRoll"
  | "awaitingDiscards"
  | "awaitingRobberPlacement"
  | "awaitingRobberVictim"
  | "awaitingDevelopmentEffect"
  | "action";

type PendingDevelopmentEffect =
  | {
      kind: "roadBuilding";
      playerId: PlayerId;
      remainingRoads: number;
      resumePhase: "awaitingRoll" | "action";
    }
  | {
      kind: "yearOfPlenty";
      playerId: PlayerId;
      remainingPicks: number;
      resumePhase: "awaitingRoll" | "action";
    }
  | {
      kind: "monopoly";
      playerId: PlayerId;
      resumePhase: "awaitingRoll" | "action";
    };

interface TurnState {
  phase: TurnPhase;
  pendingDiscards: Partial<Record<PlayerId, number>>;
  pendingRobber?: PendingRobber;
  pendingDevelopmentEffect?: PendingDevelopmentEffect;
  developmentCardPlayed: boolean;
}
```

### P2 Invariants

- `developmentCardPlayed` survives all intermediate phases within one turn and resets only when the turn advances.
- `awaitingDevelopmentEffect` has exactly one pending effect owned by the active player and no pending discard or robber interaction.
- Road Building uses `remainingRoads` 2 then 1, but completes early when no legal free-road target exists.
- Year of Plenty uses `remainingPicks` 2 then 1, but completes early when all bank resource counts are zero.
- Monopoly completes after one valid resource choice and never changes bank stock.
- Completing an effect removes pending effect data and restores its `resumePhase`.

## P2 Command Contracts

| Command | Contract | Legal phase |
|---|---|---|
| `PLAY_DEVELOPMENT_CARD` | `playerId`, `cardId`; starts Knight or a pending standard effect | `awaitingRoll` or `action` |
| `PLACE_FREE_ROAD` | `playerId`, `edgeId`; consumes one Road Building placement | `awaitingDevelopmentEffect` / `roadBuilding` |
| `CHOOSE_YEAR_OF_PLENTY_RESOURCE` | `playerId`, `resource`; transfers one available bank card | `awaitingDevelopmentEffect` / `yearOfPlenty` |
| `CHOOSE_MONOPOLY_RESOURCE` | `playerId`, `resource`; transfers all opponents' matching cards | `awaitingDevelopmentEffect` / `monopoly` |

## Standard Port Data

`StandardBoardData` adds `ports: MaritimePort[]`. Standard construction derives boundary edges from the shared 54-vertex/72-edge topology and assigns nine deterministic port pairs.

Port invariants:

- exactly nine ports;
- exactly four `generic` ports;
- exactly five `resource` ports, one per resource;
- exactly eighteen distinct endpoint vertices;
- every endpoint belongs to the coastal boundary;
- ownership is derived from current buildings and is not stored separately.

## Frontend Recovery and Interaction State

```ts
interface AppState {
  game: GameState;
  guild: CommerceGuildState;
  lastDice: DiceRoll | null;
  selectedDiceTotal: number;
  selectedPlayerId: PlayerId;
  notice: string | null;
}

type BoardInteractionMode =
  | { kind: "road" }
  | { kind: "settlement" }
  | { kind: "city" }
  | { kind: "setupSettlement" }
  | { kind: "setupRoad" }
  | null;

interface ActionAvailability<TTarget = never> {
  enabled: boolean;
  reason?: string;
  targets: TTarget[];
}
```

Frontend invariants:

- A rejected command changes only `notice`; gameplay, guild, dice, and selection data retain their previous references and values.
- A successful command clears `notice`.
- Interaction mode is transient UI state and resets when the active player, turn phase, setup stage, or selected command changes.
- Targets are derived from current domain state and are never cached as game state.
- Setup interaction mode matches `game.setup.stage`; normal build modes exist only during the normal action phase.
- Maritime give/receive selections are distinct and do not dispatch until the selected ratio, player inventory, and bank stock are legal.
