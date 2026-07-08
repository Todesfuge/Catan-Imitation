# Update: Board Road Visuals U026

Date: 2026-07-08 22:12
Feature: 001-catan-imitation
Related tasks: U026
Related commits / PR: pending

## Intent

Fix the board presentation issue where terrain hexes visually overlapped and roads were not visible in the frontend.

## Scope

Adjusted the React board renderer, demo setup, and CSS. The domain topology from U025 remains the source for shared edges; this update renders only actual owned roads as player-colored markers so the board is not covered by candidate-edge guides.

## Code Changes

- `src/App.tsx`: added shared edge geometry helpers and a `RoadMarker` renderer; `BoardView` now renders actual built roads only.
- `src/App.tsx`: increased board axial spacing so hex rows no longer visually collapse.
- `src/domain/setup.ts`: seeds demo roads connected to the initial demo buildings so roads are visible on first render.
- `src/styles/app.css`: added road layer, road marker, z-index, and clearer clipped-hex boundary styling.
- `scripts/smoke-ui.mjs`: added smoke assertions for road markers, absence of all-edge guide rendering, and visible separated hex borders.
- `test/domain/productPolish.test.ts`: added regression coverage that demo roads exist and the server-rendered board does not include `edge-guide`.

## Spec / Task Changes

- `specs/001-catan-imitation/tasks.md`: added U026.
- `specs/001-catan-imitation/update-backlog.md`: added U026 acceptance criteria.
- `specs/001-catan-imitation/handoff.md`: updated current board visual status.
- `.codex/worklog/001-catan-imitation/ledger.md`: added this update index.

## Decisions

- Decision: render only actual roads, not every possible edge.
- Reason: showing every shared edge as a guide visually overwhelms the board and creates long crossing strokes in the current percent-position renderer.
- Alternatives: render subtle candidate edges only on hover/build mode, or migrate the board to SVG before showing the full edge network.
- Reversibility: a future build-mode overlay can add candidate edges back behind an explicit interaction state.

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
- Evidence: 9 test files passed, 34 tests passed.

- Command: `pnpm build:pages`
- Result: passed.
- Evidence: TypeScript build and Vite bundle completed with `/Catan-Imitation/` base.

- Command: `pnpm smoke:ui`
- Result: passed after red-green smoke update.
- Evidence: built preview exposes board, panels, activity, responsive CSS, road markers, no all-edge guide rendering, and separated hex border styling.

## Risks / Follow-ups

- Browser screenshot automation was not available in this environment because `playwright` is not installed and the current tool surface does not expose in-app browser control.
- A later SVG renderer would provide more exact road angles across responsive aspect ratios.

## Handoff

After push, inspect the deployed board visually. Expected outcome: terrain tiles are separated enough to read individually, and built roads appear as short colored segments without a full-board edge overlay.
