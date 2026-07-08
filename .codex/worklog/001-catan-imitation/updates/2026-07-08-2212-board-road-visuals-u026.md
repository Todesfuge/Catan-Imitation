# Update: Board Road Visuals U026

Date: 2026-07-08 22:12
Feature: 001-catan-imitation
Related tasks: U026
Related commits / PR: pending

## Intent

Fix the board presentation issue where terrain hexes visually overlapped and roads were not visible in the frontend.

## Scope

Adjusted the React board renderer and CSS only. The domain topology from U025 remains the source for shared edges; this update renders those shared edges as visual road positions and renders owned roads as player-colored markers.

## Code Changes

- `src/App.tsx`: added shared edge geometry helpers and a `RoadMarker` renderer; `BoardView` now renders every board edge as an `edge-guide` and built roads as `road-marker`.
- `src/App.tsx`: increased board axial spacing so hex rows no longer visually collapse.
- `src/styles/app.css`: added road layer, edge guide, road marker, z-index, and clearer clipped-hex boundary styling.
- `scripts/smoke-ui.mjs`: added smoke assertions for edge guides, road markers, and visible separated hex borders.

## Spec / Task Changes

- `specs/001-catan-imitation/tasks.md`: added U026.
- `specs/001-catan-imitation/update-backlog.md`: added U026 acceptance criteria.
- `specs/001-catan-imitation/handoff.md`: updated current board visual status.
- `.codex/worklog/001-catan-imitation/ledger.md`: added this update index.

## Decisions

- Decision: render all shared edges as subtle road-position guides, and render owned roads with a stronger player-colored marker.
- Reason: the current demo may start with no built roads, so showing only owned roads would still leave users unable to inspect road positions.
- Alternatives: seed demo roads, or hide road positions until roads are built.
- Reversibility: the renderer can switch to owned-road-only by removing the `edge-guide` branch.

- Decision: keep the board in CSS/React percent positioning rather than adding SVG geometry.
- Reason: this is the smallest change consistent with the existing board implementation and current timeline.
- Alternatives: migrate the board to a full SVG coordinate system.
- Reversibility: the new edge/vertex helper functions make a later SVG migration more direct.

## Verification

- Command: `pnpm build`
- Result: passed.
- Evidence: TypeScript build and Vite production bundle completed.

- Command: `pnpm test`
- Result: passed.
- Evidence: 9 test files passed, 33 tests passed.

- Command: `pnpm build:pages`
- Result: passed.
- Evidence: TypeScript build and Vite bundle completed with `/Catan-Imitation/` base.

- Command: `pnpm smoke:ui`
- Result: passed after red-green smoke update.
- Evidence: built preview exposes board, panels, activity, responsive CSS, edge guides, road markers, and separated hex border styling.

## Risks / Follow-ups

- Browser screenshot automation was not available in this environment because `playwright` is not installed and the current tool surface does not expose in-app browser control.
- A later SVG renderer would provide more exact road angles across responsive aspect ratios.

## Handoff

After push, inspect the deployed board visually. Expected outcome: terrain tiles are separated enough to read individually, shared edges appear as road positions, and any built road appears as a stronger colored segment.
