# Specification Quality Checklist: Seeded Random Maps and Clean Local Start

Reviewed: 2026-07-13
Artifact: `specs/003-seeded-random-maps/spec.md`

## Scope and User Value

- [x] Local direct setup, random maps, public seeds, replay, and online host restart are independently described.
- [x] Local and Online behavior are both explicit.
- [x] Custom seed entry, map editing, non-standard layouts, voting, player configuration, and whole-match determinism are explicitly out of scope.
- [x] The earlier demo-start and fixed-online-map allowances are explicitly superseded without rewriting historical specifications.

## Map Correctness

- [x] Standard terrain, number-token, and port distributions are exact and testable.
- [x] Desert, 6/8 adjacency, port adjacency, and topology constraints are explicit.
- [x] Stable content-neutral geometry identities are required for M1, with an explicit M0 legacy-reference compatibility exception.
- [x] Every supported seed must terminate with a valid map.
- [x] Seed versioning, canonical bounds, entropy, and cross-runtime determinism are explicit.

## Randomness and Privacy

- [x] Public map randomness is isolated from development cards, dice, robber theft, and Commerce Guild outcomes.
- [x] Clients cannot submit arbitrary seeds in this release.
- [x] Online fresh seeds and restart authorization remain server-owned.
- [x] Replay preserves only public map content and does not expose or reproduce private randomness.

## Lifecycle and Experience

- [x] Initial Local Game is a genuine empty snake-order setup.
- [x] Fresh and same-map reset semantics identify every state category that must be cleared or retained.
- [x] Seed display, selection, copying, localization, and clipboard failure behavior are explicit.
- [x] Online restart timing, confirmation, host-only authorization, and multi-client convergence are explicit.
- [x] Runtime demo removal and test-only fixtures are unambiguous.

## Persistence and Compatibility

- [x] New stored and wire schema expectations are explicit.
- [x] The exact v1 fixed-layout migration and `M0-STANDARD` behavior are specified.
- [x] Mid-match migration preserves gameplay rather than resetting it.
- [x] Unknown seed versions, malformed seeds, and unrecognized seedless boards fail without partial mutation.
- [x] Restart ordering, version conflicts, idempotency, persistence, projection, and broadcast reuse the authoritative room path.

## Verification

- [x] Domain invariant, golden-vector, Local, Worker, migration, privacy, concurrency, and browser evidence are required.
- [x] The 1,000-seed success threshold is measurable.
- [x] Three-context online restart convergence is required.
- [x] Full project, Worker, browser, build, smoke, dry-run, localization/documentation, and diff gates are retained.
- [x] No unresolved placeholders, TODOs, TBDs, contradictions, or ambiguous scope remain.

## Result

The approved design is represented as a testable Spec Kit specification with complete technical planning and task generation.
