# Feature Specification: Gathering Pacing, Setup Grants, and Resource Iconography

Created: 2026-07-14
Status: Approved design; awaiting written-spec review
Workflow phase: Specification

## Problem

The Commerce Guild gathering can currently be started whenever its phase is idle, and a separate six-round rule can start it automatically. This lets gatherings interrupt the match too often and provides no shared, predictable interval between gatherings. The current state also cannot authoritatively answer when the next gathering may start or which online player is allowed to start it.

Initial setup omits the standard reward from each player's second settlement, leaving every player with an empty hand after setup. Resource-heavy interfaces compound the problem by repeating localized resource words or abbreviations across compact controls and board hexes, which makes the table slower to scan than a board-game interface should be.

This release introduces one deterministic turn-based gathering cooldown, grants the second-settlement starting resources, and replaces operational resource text with one accessible icon system shared across Local and Online play.

## Users and Actors

- Current Local player: sees the authoritative gathering cooldown, may start a gathering only on their own normal action phase, and receives resources from the second setup settlement.
- Authenticated Online player: sees the public table cooldown; the Worker derives their identity from the authenticated seat when they attempt to start a gathering.
- Other players: observe the same synchronized global gathering phase and cooldown.
- Keyboard and assistive-technology user: receives complete localized resource and cooldown names even when the visual interface uses icons.
- Operator or reviewer: verifies v2-to-v3 migration, reconnect convergence, accessibility, and responsive presentation.

## Approved Product Scope

### In Scope

- Remove the automatic six-round gathering trigger.
- Allow only the current active player to manually start a gathering during a normal post-roll action phase.
- Add one table-wide gathering cooldown measured in completed player turns.
- Start a new or restarted match with a table cooldown of `2n`, where `n` is the current player count.
- Reset the table cooldown to `n` when a gathering starts.
- Exclude the initiating player's current turn from the new cooldown.
- Expose one compact cooldown counter and precise localized disabled reasons in the Commerce Guild panel.
- Preserve authoritative cooldown state across Online persistence, reconnect, and public projection.
- Upgrade room storage and wire protocol from v2 to v3 with a defined migration for active v2 rooms.
- Grant one matching resource for every non-desert hex adjacent to a player's second setup settlement, immediately when that settlement is placed.
- Deduct the complete setup grant from the bank in the same atomic transition.
- Replace visible resource names and abbreviations on operational, statistical, and state surfaces with a shared icon-plus-quantity component.
- Remove visible terrain names and terrain abbreviations from board hexes; show only the produced-resource icon and the existing number token where applicable.
- Keep complete English and Simplified-Chinese accessible names, tooltips, rules prose, help text, and natural-language game logs.

### Out of Scope

- Real-time, wall-clock, animated, or background cooldown timers.
- Player voting, host override, payment, or other ways to bypass a gathering cooldown.
- Changing redemption caps, token-transfer rules, auction round count, auction rewards, or prize redemption.
- Giving resources for the first setup settlement or for either setup road.
- Awarding anything for a desert adjacent to the second settlement.
- New resource types, terrain types, board geometry, icon packages, or externally loaded icon assets.
- Replacing resource names inside the rulebook, help copy, game logs, or other explanatory prose.
- Removing localized resource and terrain names from the accessibility tree.

## User Stories

### US1: Start Gatherings at a Fair Pace

As the current player, I can start a gathering only after the table has waited long enough, so gatherings remain meaningful events rather than actions that can be repeated at will.

Independent acceptance:

- A new match displays `2n` table turns once formal play begins.
- Setup placement does not consume the initial table cooldown.
- A successful start records `n` table turns without charging the initiator's current turn.
- Every subsequent completed player turn after the initiator's current turn reduces the displayed remaining value by one until zero.
- Once the table cooldown reaches zero, the then-current player may start if every other action-phase rule passes.
- The prior six-round automatic trigger never starts a gathering.

### US2: Enforce Gathering Authority Online

As an online participant, I see cooldown information that applies to me and cannot impersonate another player or bypass the server's action-phase and cooldown checks.

Independent acceptance:

- The client sends a no-payload gathering intent and never supplies a player identity.
- The Worker derives the player from the authenticated seat and enriches the shared domain command.
- A stale, non-current, wrong-phase, or table-cooled request is rejected without storage mutation, room-version increment, or broadcast.
- Every reconnect and recipient projection receives the same public table value.

### US3: Receive the Second-Settlement Setup Grant

As a player finishing my second setup settlement, I immediately receive one resource from every adjacent producing hex so that formal play begins with the intended starting hand.

Independent acceptance:

- The first setup settlement grants nothing.
- The second setup settlement grants one card per adjacent forest, hill, pasture, field, or mountain.
- Two adjacent hexes that produce the same resource grant two cards of that resource.
- An adjacent desert grants nothing.
- Player resources and bank inventory change together, exactly once, in the settlement transition.

### US4: Read Resources by Icon

As a player, I can recognize resource holdings, costs, trades, production, and statistics by consistent icons instead of repeatedly parsing resource words and map abbreviations.

Independent acceptance:

- Wood, brick, wool, grain, and ore use stable, visually distinct icons inside their established resource-color badges.
- A quantity remains visible next to every operational resource icon.
- Board hexes show the produced-resource icon but no visible terrain word or abbreviation; desert shows no resource icon.
- Rules, help, logs, localized accessible names, and tooltips still use complete words.
- Desktop and mobile layouts remain readable, scrollable, keyboard operable, and free of horizontal overflow.

### US5: Continue Compatible v2 Rooms

As a player in a room persisted before cooldown metadata existed, I can finish an active gathering or continue an idle game after a safe cooldown baseline is established.

Independent acceptance:

- A v2 lobby migrates without creating match-only cooldown state.
- A v2 idle or complete match migrates with a new `2n` table cooldown.
- A v2 redemption or auction phase remains active and receives a conservative `n` table cooldown baseline.
- Migration removes obsolete automatic-trigger metadata, validates the complete replacement, and persists atomically.

## Functional Requirements

### Gathering Cooldown Contract

- GP-001: A cooldown turn means one successful normal `END_TURN` transition after setup has completed; setup settlements and roads must not advance cooldown time.
- GP-002: For `n` players, a new or restarted match must begin formal play with table remaining `2n`.
- GP-003: Only the current active player may start a gathering.
- GP-004: A gathering start must require the normal post-roll action phase with no unresolved discard, robber, development-card, trade-response, or gathering input.
- GP-005: A gathering start must require the gathering phase to be idle and the table cooldown to be zero.
- GP-006: A successful start during game turn `t` must make the table next eligible at `t+n+1`.
- GP-007: The initiator's current turn must not reduce the new cooldown. Immediately after the start and immediately after the initiator ends that turn, the displayed value must remain `n`.
- GP-008: Each successful subsequent `END_TURN` after the initiator's current turn must advance eligibility by exactly one displayed turn, clamped at zero.
- GP-009: Starting a gathering must replace the prior table cooldown window with one authoritative window that applies equally to every player.
- GP-010: Cooldown calculations must use authoritative game turn and player count, not a browser clock, React timer, Worker alarm, or client-submitted value.
- GP-011: The six-round automatic gathering rule and its persisted metadata must be removed.
- GP-012: A completed gathering must remain visibly complete until the current player ends the turn, then return to idle without clearing the cooldown window or the last auction result.
- GP-013: Both fresh-map and same-map restart must reset the gathering phase and table cooldown window to the new-match baseline.
- GP-014: All rejected gathering starts must be atomic and return a stable localized reason suitable for a disabled control and protocol error mapping.

### Authenticated Online Flow and Compatibility

- GP-015: The shared domain `START_GATHERING` command must identify its initiating player, while the public wire command must remain no-payload.
- GP-016: The Worker must derive the initiating player from the authenticated seat at the existing trusted-command boundary.
- GP-017: The public projection must expose the table remaining turns; caller-specific allowed actions must derive start availability from that public value plus caller authorization and action-phase state.
- GP-018: Storage schema v3 must persist one authoritative table cooldown window, including its eligibility target and displayed-duration cap, so eviction and reconnect reconstruct the same remaining value.
- GP-019: Wire protocol v3 must validate the new cooldown projection exactly and route protocol-v2 clients through the existing incompatible-client refresh/recovery behavior.
- GP-020: A v2 lobby must migrate to v3 without fabricating a match.
- GP-021: A v2 match whose gathering is idle or complete must migrate with a table baseline of `2n` from the migration turn.
- GP-022: A v2 match in redemption or auction must preserve its phase and live gathering data and receive a table baseline of `n` that excludes the current turn.
- GP-023: Migration must remove `lastAutoGatheringRound`, validate before replacement, and produce no partial write or broadcast on failure.
- GP-024: Command idempotency, expected-version checks, persistence-before-broadcast ordering, room-version increments, and recipient-specific projections must remain on the existing serialized command path.

### Second-Settlement Resource Grant

- GP-025: Placing a player's first setup settlement must not grant resources.
- GP-026: Placing that player's second setup settlement must immediately grant one resource for each adjacent non-desert hex according to its produced resource.
- GP-027: The grant must count adjacent hexes independently, including repeated resource types, and must never grant a resource for the desert.
- GP-028: The complete grant must be deducted from the bank in the same state transition as the settlement placement.
- GP-029: The grant must occur exactly once per player and must not repeat when placing the paired setup road, finishing another player's setup, reconnecting, projecting, or restarting.
- GP-030: If corrupted or nonstandard state cannot fund the complete grant, the placement must fail before changing the building list, player hand, bank, setup order, or active player.
- GP-031: Local and Online play must use the same pure domain transition for the grant.

### Resource Icon System

- GP-032: One shared presentation component must map each resource to a stable icon from the already installed icon library and the existing semantic resource color.
- GP-033: Operational and state surfaces must render icon plus quantity instead of a visible resource word or abbreviation. This includes private hands, bank stock, build costs, player trade, maritime trade, Commerce Guild slots and redemption, resource auction outcomes, turn decisions, and statistics.
- GP-034: Statistics headers and cells must remain understandable when resource words are visually hidden; icon semantics must not depend on table position alone.
- GP-035: Resource-specific ports must render the resource icon with the exchange ratio rather than a visible resource word.
- GP-036: Every non-desert board hex must render its produced-resource icon and existing number token without a visible terrain name or terrain abbreviation.
- GP-037: Desert hexes must render neither a produced-resource icon nor a fake resource label; robber and other board-state indicators remain visible.
- GP-038: Icon-only visual content must expose complete localized accessible names through `aria-label`, `title`, visually hidden text, or an equivalent semantic contract.
- GP-039: Color must not be the only differentiator; each resource must have a distinct silhouette.
- GP-040: Rules, help, game logs, and explanatory prose must retain complete localized resource names.
- GP-041: The icon system must not add a package, remote asset, external font, or duplicate per-panel resource mapping.

### Cooldown Experience and Verification

- GP-042: The Commerce Guild idle view must show one compact numeric badge for the table cooldown.
- GP-043: A zero value must be visually distinguishable as ready without relying on color alone.
- GP-044: A disabled Start Gathering control must explain the highest-priority current reason: not playing, unresolved action phase, non-current caller, gathering in progress, or table cooldown.
- GP-045: English and Simplified-Chinese labels, pluralization, accessible names, tooltips, and error messages must cover the cooldown and every resource icon surface.
- GP-046: Automated evidence must cover three- and four-player cooldown math, current-turn exclusion, authorization, migration, reconnect, restart, setup grants, icon semantics, and removal of visible terrain text.
- GP-047: Browser evidence must cover Local desktop/mobile presentation and at least two isolated Online callers that receive the same table cooldown while retaining caller-specific start authorization.
- GP-048: Completion requires the full domain/client, Worker, browser, build, smoke, localization, accessibility, repository-guard, Wrangler dry-run, and diff-check gates used by the current schema-v2 release.

## Approved Design Constraints

### Cooldown State Model

The synchronized Commerce Guild state stores one table cooldown window containing an absolute `availableAtTurn` target and a `displayDuration` cap. A pure domain helper derives displayed remaining turns from that window and `game.turn`; it does not mutate a counter on every turn.

For a gathering started on turn `t`:

```text
table target            = t + n + 1
table display duration  = n
remaining               = min(display duration, max(0, target - current turn))
```

The duration cap keeps the value at its full duration during the initiating turn even though eligibility is one turn farther away, thereby excluding the initiating turn without a mutable skip flag. Before any gathering has started, the initial table window targets the first formal game turn plus `2n` with a `2n` display cap. Migration may create a fresh baseline window anchored at the current authoritative turn without fabricating prior history.

### Authority and Data Flow

```text
Authenticated caller / Local current control
  -> no-payload UI intent
  -> trusted boundary supplies playerId
  -> shared match command
     -> active player + action phase + idle phase
     -> public table cooldown == 0
     -> persist table cooldown window and enter redemption
  -> public table projection + caller-authorized availability
```

The UI never decides eligibility independently. It displays the same facts used by the authoritative rule and submits no target turn, remaining count, or actor identifier.

### Setup Grant Flow

The setup rule identifies whether the settlement being placed is the player's second setup settlement. It derives a resource multiset from adjacent board hexes, verifies the whole bank debit, and applies building placement, player credit, bank debit, and setup progression in one returned state. No UI adapter or Worker handler duplicates this calculation.

### Resource Presentation Boundary

A small resource presentation component owns icon selection, semantic color, quantity formatting, localized accessible text, and tooltip behavior. Existing panels use that component rather than formatting resource names themselves. Natural-language formatters remain available only for prose such as logs and rules.

The board uses the same resource-to-icon mapping in SVG. It removes the current terrain abbreviation and visible terrain text nodes. The enclosing hex keeps a localized accessible name so removing visible words does not remove semantic information.

### Structural Constraints

- `commerceGuild.ts` owns cooldown math and state updates.
- The existing setup rules own the second-settlement award.
- `applyMatchCommand.ts` composes domain operations and logs but does not own cooldown formulas or adjacency accounting.
- `GameTable.tsx` delegates icon rendering to the shared component and loses the existing terrain-mark mapping; it must not gain a second resource-icon mapping.
- The implementation reuses `lucide-react`, existing localization infrastructure, semantic resource classes, command serialization, projection, migration, and persistence paths.

## Edge Cases

- A three-player match uses initial and post-gathering durations of 6 and 3 turns; a four-player match uses 8 and 4.
- The initiator may finish a gathering and continue the rest of the same normal action phase; ending that turn does not reduce the newly assigned cooldown.
- After the initiator's current turn, exactly `n` subsequent successful player turns must complete before the table becomes eligible again.
- A gathering that completes immediately because nobody can bid still establishes the table cooldown and returns to idle only after the current turn ends.
- When the table cooldown reaches zero, the then-current player is eligible to start subject to the same authorization and action-phase rules as every other player.
- A stale online client cannot start based on a locally displayed zero after another accepted command changes the target.
- A second settlement adjacent to three producing hexes grants three cards even when two or three share a resource type.
- A second settlement adjacent to a desert grants only from the other adjacent producing hexes.
- A resource icon with a zero quantity remains semantically named where zero inventory is important.
- A board hex without a number token must not gain a fake number or resource label.
- English and Chinese resource words may remain in hidden accessibility text and are not treated as visible-text regressions.

## Success Criteria

- Deterministic three- and four-player vectors prove every table cooldown boundary, including the excluded initiating turn.
- No automatic gathering begins during at least twelve completed four-player turns unless a qualified current player explicitly starts it.
- Rejected gathering attempts leave match state, stored room, room version, and recipient snapshots unchanged.
- Every player receives the exact second-settlement adjacent-resource multiset once, with an equal bank debit.
- All named operational surfaces use the shared icon component; board DOM/SVG contains no visible terrain abbreviation or terrain-name node.
- Local and Online browser views display the selected filled resource-badge style and compact table cooldown badge without desktop or mobile overflow.
- A v2 idle match and a v2 mid-auction match migrate to v3 under the specified baselines and reconnect successfully.
- Full required verification passes before the release is described as complete or deployable.

## Assumptions

- Online rosters remain locked after match start, so `n` is stable for the life of a match.
- `game.turn` begins at one and advances only through successful normal end-turn transitions, not setup placement.
- The standard starting bank can fund every valid second-settlement grant; the atomic failure rule protects corrupted or future nonstandard states.
- A completed gathering does not prevent the initiator from completing other legal actions in the current action phase.
- The Worker and SPA continue to deploy together as one storage/wire compatibility boundary.
