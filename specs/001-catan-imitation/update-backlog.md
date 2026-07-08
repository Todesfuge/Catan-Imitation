# Ordered Update Backlog

Date: 2026-07-08
Scope: Post-MVP improvements after `453674f feat: implement catan imitation mvp`

This backlog records all known unfinished or improvable work after the MVP. Items are ordered by review value and dependency order: rule correctness first, then expansion polish, product polish, and delivery automation.

## Priority 1: Core Rule Completeness

- [x] U001 Add full setup placement flow.
  - Current state: demo preset creates initial buildings automatically.
  - Target: players can place initial settlements and roads in correct snake order.
  - Acceptance: setup phase blocks normal turns until every player has completed required initial placements.

- [x] U002 Enforce settlement distance and occupied-vertex legality.
  - Current state: occupied vertices are blocked, but Catan distance rule is not enforced.
  - Target: settlement placement rejects adjacent occupied vertices.
  - Acceptance: tests cover valid placement, occupied vertex rejection, and adjacent settlement rejection.

- [x] U003 Enforce road connectivity and ownership legality.
  - Current state: roads can be built on any unused demo edge.
  - Target: new roads must connect to the player's road network or owned building.
  - Acceptance: tests cover connected road acceptance, disconnected road rejection, and occupied edge rejection.

- [x] U004 Implement full 7-roll robber flow.
  - Current state: robber can move and blocks production.
  - Target: rolling 7 triggers discard for players above hand limit, robber movement, and optional random steal from adjacent opponent.
  - Acceptance: tests cover discard rounding, robber movement, and steal/no-steal outcomes.

- [x] U005 Add bank resource accounting and exhaustion handling.
  - Current state: player hands update, but the bank is mostly visual.
  - Target: production and builds update bank counts; exhausted resources are not overpaid.
  - Acceptance: tests cover bank decrement, build refund to bank, and limited production when bank is short.

- [x] U006 Implement game-over and winner flow.
  - Current state: score is calculated but no winner state ends the game.
  - Target: reaching target score on the active player's turn creates a winner state and blocks further actions.
  - Acceptance: tests cover normal scoring below target and winner detection at target.

## Priority 2: Development Cards and Classic Catan Systems

- [x] U007 Implement development card deck and purchase flow.
  - Current state: development cards are strings used only for simplified Commerce Guild rewards.
  - Target: deck contains knight, victory point, road building, year of plenty, and monopoly cards.
  - Acceptance: tests cover purchase cost, deck draw, hidden card ownership, and no same-turn play for non-victory cards.

- [x] U008 Implement knight cards and Largest Army.
  - Current state: Largest Army is not implemented.
  - Target: playing knights moves the robber and awards Largest Army when the threshold is met.
  - Acceptance: tests cover threshold, tie behavior, and score contribution.

- [x] U009 Implement Longest Road.
  - Current state: Longest Road is not implemented.
  - Target: calculate each player's longest continuous road and award the bonus.
  - Acceptance: tests cover simple chain, branch handling, blocked paths, and ownership boundaries.

- [x] U010 Implement maritime trade and port benefits.
  - Current state: ports are not represented in gameplay.
  - Target: generic 4:1, owned 3:1, and resource-specific 2:1 trades.
  - Acceptance: tests cover each trade ratio and ownership requirement.

## Priority 3: Commerce Guild Polish

- [x] U011 Auto-trigger Commerce Guild gatherings by interval.
  - Current state: gathering is manually triggered.
  - Target: default trigger every 6 completed rounds, with manual trigger retained for demos.
  - Acceptance: tests cover no trigger before interval and trigger at interval boundary.

- [x] U012 Improve auction validation and result display.
  - Current state: auction resolves, but UI feedback is compact.
  - Target: show invalid bid reasons, current round status, winner, payment, and blind-box result.
  - Acceptance: manual smoke confirms invalid bids are visible and successful auction result is clear.

- [x] U013 Integrate Commerce Guild development-card rewards with the real card deck.
  - Current state: blind boxes can create a simplified development card string.
  - Target: blind-box card reward draws from the same deck as normal development purchases.
  - Acceptance: tests cover reward draw and empty deck handling.

- [x] U014 Improve token transfer UX and log naming.
  - Current state: transfers work, but logs may show internal player ids.
  - Target: logs and controls consistently use player display names.
  - Acceptance: manual smoke confirms transfer logs use names and reject impossible transfers clearly.

## Priority 4: UI and Product Polish

- [x] U015 Connect left utility rail actions.
  - Current state: settings, rulebook, fullscreen, and info now open real controls or invoke browser fullscreen.
  - Target: show settings/help/info panels and use browser fullscreen where available.
  - Acceptance: product-polish test covers utility labels; browser smoke confirms Settings opens a visible dismissible modal.

- [x] U016 Add guided phase prompts and error recovery.
  - Current state: the action bar now shows phase guidance and invalid actions retain recoverable toast messages.
  - Target: action bar explains the current expected step and suggests how to recover from invalid actions.
  - Acceptance: product-polish test covers the visible phase prompt; existing reducer errors continue to surface through the toast.

- [x] U017 Improve board visual fidelity and inspectability.
  - Current state: hexes now show terrain labels, terrain badges, probability pips on number tokens, robber, settlements, and cities.
  - Target: improve terrain icons, number-token pips, port indicators, and piece clarity without copying proprietary assets.
  - Acceptance: product-polish test covers terrain icons and dice pips; desktop browser smoke confirms 19 hexes, 19 terrain badges, and 18 dice-pip groups.

- [x] U018 Add real local chat or remove chat affordance.
  - Current state: the nonfunctional chat shell has been replaced by an Activity summary.
  - Target: either local message log works, or the panel is renamed to activity/help to avoid false affordance.
  - Acceptance: product-polish test confirms Chat and Local hot-seat demo copy are absent.

- [x] U019 Harden mobile layout.
  - Current state: mobile and tablet breakpoints use stacked panels and two-column controls where space is tight.
  - Target: mobile gets a clearer stacked interaction pattern and board controls remain readable.
  - Acceptance: browser smoke at 390x844 and 768x1024 showed 19 hexes visible and no horizontal overflow.

## Priority 5: Engineering and Delivery

- [x] U020 Add GitHub Actions CI.
  - Current state: `.github/workflows/ci.yml` runs install, test, build, and UI smoke on push to `main` and pull requests.
  - Target: run `pnpm install`, `pnpm test`, and `pnpm build` on push and pull request.
  - Acceptance: delivery-readiness test covers workflow content; local `pnpm test`, `pnpm build`, and `pnpm smoke:ui` pass.

- [x] U021 Add deployment.
  - Current state: `.github/workflows/pages.yml` runs `pnpm build:pages` with `/Catan-Imitation/` base and deploys `dist` to GitHub Pages.
  - Target: deploy to GitHub Pages, Vercel, or another static host.
  - Acceptance: README links to `https://todesfuge.github.io/Catan-Imitation/`; Pages workflow publishes on `main`.

- [x] U022 Add UI smoke tests.
  - Current state: `pnpm smoke:ui` starts Vite preview through the Vite API and checks built HTML, JS, CSS, board/panel strings, Activity, and mobile breakpoint CSS.
  - Target: automate rendering checks for board, panels, statistics, and Commerce Guild controls.
  - Acceptance: CI runs `pnpm smoke:ui`; local smoke command passes after `pnpm build`.

- [x] U023 Add PR and issue templates.
  - Current state: PR, bug, and feature templates live under `.github/` and reference verification expectations.
  - Target: repository includes templates for feature work, bug reports, and PR validation.
  - Acceptance: delivery-readiness test confirms templates exist and include expected sections.

- [x] U024 Add roadmap milestones.
  - Current state: `docs/roadmap.md` groups completed and future milestones, and README links it.
  - Target: group follow-up work into reviewable milestones: rules, expansion, UI polish, delivery.
  - Acceptance: delivery-readiness test confirms README roadmap link and Delivery Automation milestone.

- [x] U025 Normalize board topology to shared Catan vertices and edges.
  - Current state: `src/domain/board.ts` now deduplicates neighboring hex corners and sides into 54 shared vertices and 72 shared edges.
  - Target: settlements/cities live on real intersections, roads live on real edges, and production can pay from every terrain adjacent to a shared intersection.
  - Acceptance: production tests cover 54/72 topology counts and multi-hex production from one settlement vertex; full test/build/smoke verification passes.

- [x] U026 Separate board hexes visually and render road edges.
  - Current state: the board now uses wider axial spacing, visible hex drop-shadow boundaries, and player-colored road markers for actual built roads.
  - Target: neighboring hexes have clear visual boundaries and existing roads are readable without covering the board in candidate-edge guides.
  - Acceptance: product-polish and UI smoke checks cover actual road markers, absence of all-edge guide rendering, visible hex border styling, board panels, and responsive CSS.
