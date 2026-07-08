# Update: SVG Board Geometry

Date: 2026-07-08 22:39
Feature: 001-catan-imitation
Related tasks: U027
Related commits / PR: pending

## Intent

Fix the visual board alignment issue where CSS-positioned clipped hex boxes could not line up with the shared point-top Catan topology used by intersections and roads.

## Scope

Replace the main board's CSS clipped hex layout with SVG polygons, lines, and markers generated from one board geometry projection.

## Code Changes

- `src/ui/boardGeometry.ts`: added point-top SVG projection helpers for hex centers, polygon points, shared vertices, and road endpoints.
- `src/App.tsx`: replaced absolute-positioned HTML hex buttons and road spans with one SVG board containing terrain polygons, road lines, building rectangles, robber marker, labels, and dice tokens.
- `src/styles/app.css`: replaced `.hex`/`clip-path` board styling with SVG classes for board polygons, terrain fills, road strokes, labels, robber, and buildings.
- `test/domain/boardGeometry.test.ts`: added projection tests for shared vertices, road endpoints, and board viewbox bounds.
- `test/domain/productPolish.test.ts`: added SSR/CSS checks for SVG board rendering, absence of CSS clipping, road markers, and SVG terrain fills.
- `scripts/smoke-ui.mjs`: extended built-asset smoke checks for SVG board classes, no `clip-path`, and terrain fill styling.

## Spec / Task Changes

- `specs/001-catan-imitation/update-backlog.md`: added and completed U027 for shared SVG board geometry.
- `specs/001-catan-imitation/handoff.md`: updated current scope, board rendering description, test count, and known limits.

## Decisions

- Decision: use one SVG coordinate system for tiles, roads, buildings, robber, labels, and dice tokens.
- Reason: SVG polygons and lines can share exact coordinates, which fixes the geometric mismatch caused by CSS clipped boxes.
- Alternatives: rotate the CSS hex boxes by ninety degrees or widen spacing further. These would still keep separate positioning models for tiles and road/intersection topology.
- Reversibility: medium. The geometry helper isolates the projection logic, so future board artwork can replace SVG shapes while keeping the same coordinates.

## Verification

- Command: `pnpm test -- test/domain/boardGeometry.test.ts test/domain/productPolish.test.ts`
- Result: passed after implementation.
- Command: `pnpm test`
- Result: 10 test files, 39 tests passed.
- Command: `pnpm build`
- Result: production build passed.
- Command: `pnpm build:pages`
- Result: GitHub Pages build passed with `/Catan-Imitation/` base.
- Command: `pnpm smoke:ui`
- Result: built preview smoke passed.
- Command: `git diff --check`
- Result: no whitespace errors; Windows line-ending warnings only.

## Risks / Follow-ups

- Browser screenshot verification succeeded once for SVG presence and road/hex counts, then the browser connection timed out on reload. The final color fix is covered by automated product-polish and smoke checks.
- The board is still functional/prototype art, not production-grade illustrated asset work.

## Handoff

Review the current board at `http://127.0.0.1:5273/` while the dev server is running. The important structural change is that road endpoints and settlement/city positions now come from `src/ui/boardGeometry.ts`, not separate CSS percentage math.
