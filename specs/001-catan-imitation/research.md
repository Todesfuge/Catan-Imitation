# Research Notes

Created: 2026-07-08
Last updated: 2026-07-11

## Technical Choices

- Vite + React + TypeScript gives the fastest path to a polished browser demo with typed code and a simple build pipeline.
- Pure functions in `src/domain` make the most important behavior testable without browser automation.
- CSS/SVG board rendering is preferable to Canvas for this challenge because UI panels, tooltips, click targets, and statistics tables integrate more quickly with React.
- Random outcomes in the Commerce Guild should accept an injected random source so tests can force blind-box outcomes.

## Product Interpretation

- The target online UI prioritizes a large board and dense side information rather than a marketing-style landing page.
- A portfolio reviewer should see the requested innovation quickly, so the Commerce Guild and statistics controls should be first-class panels, not hidden debug tools.
- Catan Imitation should use original visual assets. Similar layout and information hierarchy are acceptable; copying proprietary art is not.

## Historical Technical Unknowns (Resolved)

- Package installation and the Vite/Vitest toolchain are available through the checked-in pnpm lockfile and current local installation.
- Board interaction uses fixed topology ids plus a shared SVG projection, so no additional geometric hit-testing approach is needed for this update.

## Core Rule Integrity Decisions

- Decision: use an explicit typed turn state rather than independent booleans.
  - Reason: discard, robber placement, victim choice, and knight resume behavior must not form contradictory combinations.
  - Rejected: reducer-only `hasRolled` / `mustMoveRobber` flags because they distribute invariants across UI and orchestration code.
- Decision: create one bounded `turnFlow.ts` owner and keep `gameReducer.ts` as the compatibility facade for UI commands.
  - Reason: the reducer is already a maintainability hotspot and should not absorb new rule logic.
  - Rejected: a generic command/event engine because there is only one current state-machine implementation and no dependency is needed.
- Decision: model player-selected seven-roll discards before robber placement.
  - Reason: this is observable classic behavior approved for the update and requires cross-player progress tracking.
- Decision: reuse the same staged robber flow for seven rolls and knights, with an explicit resume phase.
  - Reason: it prevents the two entry points from drifting while preserving pre-roll knight timing.
- Decision: keep Commerce bank helpers local to `commerceGuild.ts` during this update.
  - Reason: resource arithmetic is duplicated elsewhere, but a broad ledger refactor would expand the regression surface beyond CR-014 through CR-018.
- Decision: add a bounded `TurnFlowPanel` instead of growing `App.tsx` with discard selection state and victim controls.
  - Reason: the UI file is already the top static hotspot; the new workflow has a clear rendering responsibility.

## Resolved Unknowns for This Update

- The current TypeScript/Vitest stack can express the state machine and deterministic random tests without new packages.
- Board hex and shared-vertex data already supports robber victim eligibility and settlement-road connectivity checks.

## P2 Development Cards and Ports

- Decision: extend the existing turn state with one discriminated pending development effect.
  - Reason: Road Building and Year of Plenty require sequential choices and phase restoration, matching the already successful staged robber pattern.
  - Rejected: a generic card/effect engine, because five fixed standard card kinds do not justify a new abstraction layer.
- Decision: enforce one playable non-victory card per turn with a turn-state flag shared by Knight and the three new active effects.
  - Reason: the limit is turn-scoped, must survive intermediate phases, and resets naturally with turn advancement.
- Decision: reuse road legality for a cost-free Road Building placement path.
  - Reason: connectivity, occupancy, opponent blocking, Longest Road, and winner behavior must not drift between paid and free roads.
- Decision: resolve Year of Plenty one card at a time from live bank stock and Monopoly in one all-opponent transfer.
  - Reason: these flows preserve explicit player choice while keeping inventory conservation observable and atomic per command.
- Decision: derive deterministic ports from boundary topology and keep ownership computed from buildings.
  - Reason: the board already has canonical shared vertices/edges; a second ownership store would drift.
- Decision: render original SVG port labels and endpoint connectors through existing board projection.
  - Reason: port gameplay should be inspectable without introducing image assets or geometry duplication.
- Finding: the former React-level `try/catch` around `dispatchBase` could not catch errors thrown when `useReducer` processed the update. A reproduced zero-resource Road click unmounted the production React root.

## Frontend Completeness Decisions

- Decision: catch expected rule errors inside the exported reducer boundary and retain throwing domain APIs.
  - Reason: direct domain tests keep strong failure contracts while React always receives a valid next state.
  - Rejected: an Error Boundary, because it would replace the game after the error instead of preserving the prior state.
- Decision: compose one application-level action-availability selector from current domain functions.
  - Reason: action buttons, reasons, and board targets must agree without moving UI concerns into domain entities.
  - Rejected: independent React predicates, which caused the zero-resource Road button and illegal first-target heuristics.
- Decision: preserve the demo as the initial portfolio view and add New Game as the entry to existing setup rules.
  - Reason: this keeps the fast review path while making a complete local game reachable.
- Decision: add Playwright despite the new dependency.
  - Reason: the blocker exists specifically in real React scheduling and produced a blank browser root while all Vitest and bundle-smoke checks passed.
  - Rejected: source-string smoke alone, because it cannot prove click behavior, focus, or responsive layout.
- Decision: reorder narrow layouts to board, actions, then secondary panels.
  - Reason: road/setup/robber choices require the action prompt and board to remain adjacent.

## Readability, Player Trade, and Localization Decisions

- Finding: `.turn-flow-panel` uses a dark surface without an explicit foreground, so robber text inherits the page's dark ink. `.development-effect-panel` already demonstrates the working light-foreground pattern.
- Finding: `.log-panel` and `.tool-panel` clip overflow while `.log-list` and `.dice-income-list` do not own a bounded scroll region.
- Decision: model one public multi-resource offer in application state and keep exchange arithmetic in `playerTrade.ts`.
  - Reason: a hot-seat acceptance step must survive component rerenders and be atomically validated; component-local state and Commerce Guild ownership are both incorrect boundaries.
- Decision: clear public offers at end turn and allow any single eligible non-active player to accept.
  - Reason: this matches the approved public-offer behavior without introducing cross-turn queues or multiple-offer coordination.
- Decision: implement a small local message catalog and session-scoped locale provider.
  - Reason: only two fixed locales exist, React and browser storage are already available, and a third-party i18n dependency would add more surface than value.
- Decision: add keyed log metadata while retaining English fallback messages.
  - Reason: historical logs must retranslate immediately while existing tests and integrations still need readable fallback text.
- Decision: add a separate complete `README.zh-CN.md` with reciprocal links.
  - Reason: it keeps each README readable and discoverable without doubling every section in one file.
