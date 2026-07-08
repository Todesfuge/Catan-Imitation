# Update: Shared Board Topology U025

Date: 2026-07-08 22:00
Feature: 001-catan-imitation
Related tasks: U025
Related commits / PR: pending

## Intent

Correct the Catan rules model so settlements and cities are placed on shared intersections, roads are placed on shared edges, and production can pay from every terrain adjacent to the same intersection.

## Scope

Replaced per-hex private vertex/edge generation with canonical shared board topology for the standard 19-hex board. Kept the existing `vertexId` and `edgeId` contracts so building, production, longest-road, and port systems continue to use the same domain boundaries.

## Code Changes

- `src/domain/board.ts`: deduplicates neighboring hex corners and sides into 54 shared vertices and 72 shared edges.
- `src/domain/rules/building.ts`: rejects settlements on vertex ids that do not exist on the board.
- `src/domain/setup.ts`: seeds demo buildings from actual board vertices rather than hardcoded private vertex ids.
- `test/domain/production.test.ts`: added red-green coverage for shared topology counts and multi-hex production from one settlement.
- `test/domain/coreRulesBacklog.test.ts`: updated setup and settlement tests to query legal shared vertices/edges.
- `test/domain/gameplay.test.ts`: updated build-flow tests to use a real edge connected to the player's building.
- `test/domain/classicSystems.test.ts`: updated port ownership tests to bind ports to the player's actual building vertex.

## Spec / Task Changes

- `specs/001-catan-imitation/tasks.md`: added U025.
- `specs/001-catan-imitation/update-backlog.md`: added U025 acceptance criteria and corrected delivery branch references to `main`.
- `specs/001-catan-imitation/handoff.md`: replaced the old shared-intersection limitation with the completed topology status and updated test count.
- `.codex/worklog/001-catan-imitation/ledger.md`: added this update index.

## Decisions

- Decision: fix topology in `board.ts` instead of adding compensating logic in production or UI.
- Reason: the root cause was duplicated board intersections; production, ports, roads, and distance rules should all depend on one canonical topology.
- Alternatives: add adjacency lookup tables by hex id, or special-case production to inspect nearby hexes visually.
- Reversibility: `createStandardBoardData()` is the isolated generation point if the board geometry needs further refinement.

- Decision: preserve existing `BoardHex.vertexIds`, `BoardHex.edgeIds`, `Building.vertexId`, and `Road.edgeId` contracts.
- Reason: this keeps behavior changes contained and avoids a parallel board API during the timed project.
- Alternatives: introduce first-class `BoardVertex` records and migrate renderers/rules to them immediately.
- Reversibility: shared ids can be promoted to explicit vertex records later without changing saved building/road ownership semantics.

## Verification

- Command: `pnpm test`
- Result: passed.
- Evidence: 9 test files passed, 33 tests passed.

- Command: `pnpm build`
- Result: passed.
- Evidence: TypeScript build and Vite production bundle completed.

- Command: `pnpm build:pages`
- Result: passed.
- Evidence: TypeScript build and Vite bundle completed with `/Catan-Imitation/` base.

- Command: `pnpm smoke:ui`
- Result: passed.
- Evidence: built preview exposes board, panels, activity, and responsive CSS.

## Risks / Follow-ups

- The action bar still auto-picks the first open vertex and may need a separate UI candidate-filtering pass to avoid suggesting a distance-rule-invalid settlement.
- The board renderer still infers marker positions from the first hex containing a vertex; this works with canonical shared ids but could become an explicit vertex-coordinate renderer later.

## Handoff

Push after final diff checks. Then inspect the board visually: buildings should sit on intersections, and production/statistics should reflect multi-hex adjacency.
