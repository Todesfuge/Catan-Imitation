# Feature Specification: Seeded Random Maps and Clean Local Start

Created: 2026-07-13
Status: Design approved; specification awaiting user review
Workflow phase: Feature specification

## Problem

Every match currently uses one fixed terrain, number-token, and port layout. Local Game also opens a prepared portfolio scenario with existing buildings and roads instead of beginning a real match. This makes repeated play predictable and makes the Local Game entry misleading.

New matches need balanced but genuinely varied boards. A public map seed must identify each layout without revealing hidden gameplay randomness. Local Game must enter real snake-order setup immediately, and an online room host must be able to restart either on a fresh board or on the current board.

This feature supersedes the earlier allowances that the initial Local Game may open a demo preset and that randomized online boards were outside the first online release.

## Users and Actors

- Local hot-seat player: enters a fresh four-player setup without a network connection.
- Online room host: starts a random match and may restart the room on a fresh or repeated map.
- Online room participant: sees and copies the public map seed and converges to the host-authorized restart.
- Reviewer or operator: verifies deterministic generation, compatibility, fairness, and removal of the runtime demo path.

## Approved Product Scope

### In Scope

- Randomize terrain, number tokens, port positions, and port types for every newly created Local or Online match.
- Preserve the standard 19-hex geometry and standard component counts.
- Prevent 6 and 8 tokens from occupying adjacent hexes.
- Place nine ports on distinct, non-adjacent coastal edges and preserve the standard port-type distribution.
- Give every map a public, versioned seed that recreates the same public layout across browser, Worker, and tests.
- Display and copy the seed in both modes.
- Let Local Game restart on a fresh map or the same map.
- Let the authenticated online host restart at any time, after confirmation, on a fresh map or the same map.
- Start Local Game directly in a real four-player snake-order setup using the current default player names.
- Remove the prepared demo-game factory and all runtime demo paths from production code.
- Migrate compatible live rooms created before map seeds existed.

### Out of Scope

- Custom seed entry, a seed browser, map sharing/import UI, or a map editor.
- Non-standard board geometry, component counts, number sets, port counts, or two-player layouts.
- Using the public seed for development-card order, dice, robber theft, Commerce Guild rewards, bids, or any other hidden/random match result.
- Player voting or unanimous approval for an online restart.
- Changing the current four default Local Game player names or adding a player-configuration screen.
- Persisting a Local Game across page reloads.
- Keeping a hidden query, debug control, or production API for the prepared demo scenario.

## User Stories

### US1: Enter a Real Local Match

As a local player, I enter Local Game and immediately receive an empty, randomized setup board so that I start a genuine match rather than a prepared example.

Independent acceptance:

- The first Local Game state is in snake-order setup.
- It has no buildings, roads, player resources, pending trade, pending bid, or demo progress.
- It uses the existing four default player names and begins with the first player's settlement placement.
- No additional “New Game” click is required to reach setup.

### US2: Play on a Balanced Random Board

As a player, every new match uses a different valid standard layout so that repeated games vary without allowing severely unbalanced red-number placement or unusable ports.

Independent acceptance:

- Terrain, numbers, port edges, and port types are seeded and variable.
- Standard terrain, number, and port multisets are preserved exactly.
- The desert has no number, no 6/8 pair is adjacent, and no two ports occupy adjacent coastal edges.
- The topology remains 19 hexes, 54 unique vertices, and 72 unique edges.

### US3: Identify and Replay a Map

As a player, I can see and copy the public map seed and use the current seed to restart so that a notable layout can be replayed without exposing hidden randomness.

Independent acceptance:

- Every caller sees the same canonical seed for the current map.
- Replaying the seed reproduces terrain, numbers, port positions, and port types exactly.
- Replaying does not reproduce the development deck, dice, robber thefts, or Commerce Guild outcomes.
- Clipboard failure leaves the seed visible and selectable and produces a localized recoverable notice.

### US4: Restart an Online Room Authoritatively

As a room host, I can confirm a fresh-map or same-map restart at any point so that the existing group can begin again without creating another room.

Independent acceptance:

- Only the currently authenticated host can issue the restart.
- The browser sends only `fresh` or `sameMap`; it does not choose or submit an arbitrary seed.
- One serialized command resets the match, clears pending public/private input, increments the room version, persists, and broadcasts a complete caller-specific setup projection.
- Concurrent or stale restarts cannot apply twice.

### US5: Preserve Compatible Live Rooms

As an online player in a room created before this feature, I can continue or restart when the stored fixed map is recognized, while corrupt or unknown records fail safely.

Independent acceptance:

- A valid legacy fixed-layout room is normalized to the reserved seed `M0-STANDARD` and remains playable.
- Replaying `M0-STANDARD` recreates the released fixed map.
- A seedless room whose board is not the released fixed layout is rejected without mutation.
- Invalid or unknown seed versions never silently fall back to another map.

## Functional Requirements

### Seeded Board Contract

- RM-001: Board geometry must remain the standard 19 coordinate positions with 54 unique vertices and 72 unique edges.
- RM-002: Every generated map must contain four forests, four pastures, four fields, three hills, three mountains, and one desert.
- RM-003: Every generated map must contain one each of 2 and 12 and two each of 3, 4, 5, 6, 8, 9, 10, and 11; the desert must contain no number.
- RM-004: None of the four 6/8 tokens may occupy adjacent hexes.
- RM-005: Every generated map must contain nine ports on nine non-adjacent coastal edges: four generic ports and one resource port for each resource.
- RM-006: Hex, vertex, edge, and port identities must be stable geometry identities and must not encode the current terrain, number, or port type.
- RM-007: A canonical, bounded, versioned `M1` seed must reproduce the complete public layout identically in browser, Worker, and deterministic tests.
- RM-008: Every syntactically valid supported seed must produce a valid board; generation must not depend on an unbounded retry loop.
- RM-009: New seeds must contain enough entropy to make accidental repetition negligible for this product, while remaining short enough to display and copy.
- RM-010: The seed-derived random stream must be isolated from all hidden match randomness.

### Match Creation and Restart

- RM-011: Every new Local Game, online room start, fresh Local restart, and fresh online restart must create a new `M1` map.
- RM-012: Entering Local Game must immediately create a four-player setup match with the current default names.
- RM-013: Initial setup must begin with empty buildings and roads, empty player resources and private hands, a full bank, a newly shuffled development deck, a fresh Commerce Guild state, and no pending trade, auction, or decision.
- RM-014: Same-map restart must retain only the player roster and current map seed while resetting all other match and expansion state.
- RM-015: Fresh-map restart must retain only the player roster and generate a new map seed before performing the same complete reset.
- RM-016: Both restart modes must enter settlement-first snake-order setup at player one.
- RM-017: Production runtime code must delete and must not expose, import, or invoke the former `createDemoGame` prepared-scenario factory; scenario-heavy tests must use test-only fixtures.

### Seed and Restart Experience

- RM-018: Local and Online settings must display the canonical public map seed as selectable text.
- RM-019: Both modes must provide an accessible Copy Seed control with English and Simplified-Chinese success/failure feedback.
- RM-020: Local Game must offer New Random Map and Replay Current Map controls.
- RM-021: Every online participant must see and be able to copy the seed, while only the current host may use restart controls.
- RM-022: Online restart must require explicit confirmation and may be initiated at any match phase.
- RM-023: This release must not expose arbitrary seed entry; replay always means the current persisted seed.

### Online Authority, Persistence, and Compatibility

- RM-024: The authoritative room must derive restart permission from the authenticated seat and current host record, never from a client-supplied player or host identifier.
- RM-025: A restart must use the existing command ordering, expected-version and version conflict handling, idempotency, persistence, projection, and broadcast transaction path.
- RM-026: A successful restart must clear pending player trades, sealed bids, private decisions, command-local UI state, and obsolete action acknowledgements before broadcasting the new setup.
- RM-027: The stored room schema must require a supported map seed for new records and must represent this persisted-shape change with a new room schema version.
- RM-028: A compatible v1 room may migrate only when its full public board matches the released fixed layout; migration assigns `M0-STANDARD`, preserves live gameplay state, and persists atomically.
- RM-029: A malformed, unsupported, or noncanonical seed or an unrecognized seedless board must produce the existing incompatible/internal safety behavior without a partial write.
- RM-030: The wire schema must make the public map seed and caller restart capability explicit; an incompatible old client must receive the existing refresh/recovery path rather than a partial projection.

### Error Handling and Verification

- RM-031: A generation or restart failure must leave the previous stored room and room version unchanged and must not broadcast partial state.
- RM-032: Clipboard unavailability must not block play, restart, or manual selection of the displayed seed.
- RM-033: Automated tests must cover map invariants over a large deterministic seed set, golden deterministic layouts, Local boot/reset behavior, host authorization, concurrent restarts, legacy migration, corruption rejection, and private-random isolation.
- RM-034: Browser verification must cover Local direct setup and three isolated Online contexts converging after both restart modes.
- RM-035: Completion requires the full main, Worker, browser, build, Worker smoke, Wrangler dry-run, localization/documentation, and diff-check gates used by the released online feature.

## Approved Design Constraints

### State and Randomness

The synchronized public game state owns one canonical map seed. A seed-specific deterministic generator creates only public board content. Match creation receives hidden randomness separately for development-card shuffling and later rule outcomes. Replaying a map reuses the public seed but consumes fresh hidden randomness.

The first generator version is identified by the `M1` prefix. The released fixed board is reserved as `M0-STANDARD` for compatibility and is never emitted as a new random seed.

### Authority Flow

```text
Local entry / local restart
  -> shared match creation
     -> seed choice (fresh or current)
     -> deterministic public board
     -> independent hidden deck shuffle
     -> empty snake-order setup

Authenticated online host intent
  -> room command validation and serialization
     -> shared match creation
     -> persist new room version
     -> caller-specific projections for every seat
```

Clients never submit an arbitrary seed in this release. The online host submits only the restart mode; the room reads the current seed or generates a new one.

### Compatibility

The room storage migration recognizes only the exact released fixed layout when upgrading seedless records. It adds `M0-STANDARD` without changing buildings, roads, hands, phase, pending state, or room version beyond the migration's established persistence semantics. Unknown shapes remain untouched and incompatible.

## Edge Cases

- The desert occupies any coordinate and always begins with the robber and no number token.
- A deterministic seed whose early choices would cluster 6/8 or ports must still terminate with a valid constrained selection.
- Same-map restart during setup, a robber decision, a public trade, a sealed auction, or game over must clear every pending path consistently.
- Two host restart commands with the same or stale expected version must not produce two resets.
- Host transfer before a restart must make the former host unauthorized and the new host authorized.
- A disconnected participant receives the new setup through the normal reconnect snapshot.
- Clipboard permission denial, missing clipboard APIs, or non-secure local context must leave the seed manually copyable.
- An old v1 room may be mid-match when normalized; migration must not reset its game.
- Future unknown seed versions must be rejected until an explicit compatible generator exists.

## Success Criteria

- At least 1,000 deterministic `M1` seeds pass every board-distribution, adjacency, port, and topology invariant.
- A published golden set produces byte-for-byte equivalent public layouts in the main and Worker test environments.
- Entering Local Game reaches an empty setup board without an intermediate demo screen or New Game action.
- Same-map restart preserves the complete public board while producing a fresh hidden development deck; fresh restart changes the seed and board for fixed verification vectors.
- Three browser contexts display one seed and converge to the same setup after a host-authorized same-map restart and fresh-map restart.
- A valid v1 fixed-layout room migrates and continues, while a malformed seedless room is rejected without mutation.
- No production source exports or calls the former demo-game factory.
- All required final gates pass before the feature is described as complete.

## Assumptions

- Local Game remains a four-player hot-seat mode using the existing default names.
- Online rooms retain their current three/four-seat roster and host identity across restart.
- The host is trusted to restart a private room at any time after an explicit client confirmation.
- Public seed portability is guaranteed for supported seed versions; arbitrary seed entry is a possible future enhancement, not part of this release.
- Existing Local Game state is intentionally not preserved across a page reload.
