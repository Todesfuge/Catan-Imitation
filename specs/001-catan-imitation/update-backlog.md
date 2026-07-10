# Ordered Update Backlog

Date: 2026-07-08
Scope: Post-MVP improvements after `453674f feat: implement catan imitation mvp`

This backlog records completed and planned post-MVP improvement work. Items remain ordered by review value and dependency order: rule correctness first, then expansion polish, product polish, delivery automation, and integrity hardening.

## Priority 1: Core Rule Completeness

- [x] U001 Add full setup placement flow.
  - Baseline: demo preset created initial buildings automatically.
  - Target: players can place initial settlements and roads in correct snake order.
  - Acceptance: setup phase blocks normal turns until every player has completed required initial placements.

- [x] U002 Enforce settlement distance and occupied-vertex legality.
  - Baseline: occupied vertices were blocked, but the Catan distance rule was not enforced.
  - Target: settlement placement rejects adjacent occupied vertices.
  - Acceptance: tests cover valid placement, occupied vertex rejection, and adjacent settlement rejection.

- [x] U003 Enforce road connectivity and ownership legality.
  - Baseline: roads could be built on any unused demo edge.
  - Target: new roads must connect to the player's road network or owned building.
  - Acceptance: tests cover connected road acceptance, disconnected road rejection, and occupied edge rejection.

- [x] U004 Implement full 7-roll robber flow.
  - Baseline: the robber could move and block production, but seven-roll resolution was incomplete.
  - Target: rolling 7 triggers discard for players above hand limit, robber movement, and optional random steal from adjacent opponent.
  - Acceptance: tests cover discard rounding, robber movement, and steal/no-steal outcomes.

- [x] U005 Add bank resource accounting and exhaustion handling.
  - Baseline: player hands updated, but the bank was mostly visual.
  - Target: production and builds update bank counts; exhausted resources are not overpaid.
  - Acceptance: tests cover bank decrement, build refund to bank, and limited production when bank is short.

- [x] U006 Implement game-over and winner flow.
  - Baseline: score was calculated but no winner state ended the game.
  - Target: reaching target score on the active player's turn creates a winner state and blocks further actions.
  - Acceptance: tests cover normal scoring below target and winner detection at target.

## Priority 2: Development Cards and Classic Catan Systems

- [x] U007 Implement development card deck and purchase flow.
  - Baseline: development cards were strings used only for simplified Commerce Guild rewards.
  - Target: deck contains knight, victory point, road building, year of plenty, and monopoly cards.
  - Acceptance: tests cover purchase cost, deck draw, hidden card ownership, and no same-turn play for non-victory cards.

- [x] U008 Implement knight cards and Largest Army.
  - Baseline: Largest Army was not implemented.
  - Target: playing knights moves the robber and awards Largest Army when the threshold is met.
  - Acceptance: tests cover threshold, tie behavior, and score contribution.

- [x] U009 Implement Longest Road.
  - Baseline: Longest Road was not implemented.
  - Target: calculate each player's longest continuous road and award the bonus.
  - Acceptance: tests cover simple chain, branch handling, blocked paths, and ownership boundaries.

- [x] U010 Implement maritime trade and port benefits.
  - Baseline: ports were not represented in gameplay.
  - Target: generic 4:1, owned 3:1, and resource-specific 2:1 trades.
  - Acceptance: tests cover each trade ratio and ownership requirement.

## Priority 3: Commerce Guild Polish

- [x] U011 Auto-trigger Commerce Guild gatherings by interval.
  - Baseline: gathering was manually triggered.
  - Target: default trigger every 6 completed rounds, with manual trigger retained for demos.
  - Acceptance: tests cover no trigger before interval and trigger at interval boundary.

- [x] U012 Improve auction validation and result display.
  - Baseline: auctions resolved, but UI feedback was compact.
  - Target: show invalid bid reasons, current round status, winner, payment, and blind-box result.
  - Acceptance: manual smoke confirms invalid bids are visible and successful auction result is clear.

- [x] U013 Integrate Commerce Guild development-card rewards with the real card deck.
  - Baseline: blind boxes could create a simplified development-card string.
  - Target: blind-box card reward draws from the same deck as normal development purchases.
  - Acceptance: tests cover reward draw and empty deck handling.

- [x] U014 Improve token transfer UX and log naming.
  - Baseline: transfers worked, but logs could show internal player ids.
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

- [x] U027 Replace CSS-positioned board tiles with shared SVG board geometry.
  - Current state: the board renders SVG hex polygons, roads, buildings, robber, labels, and dice tokens from one point-top geometry projection.
  - Target: hex polygons, roads, and buildings are all projected from the same point-top board geometry so neighboring hex borders, roads, and intersections align.
  - Acceptance: geometry tests cover shared vertex projection and road endpoint projection; product-polish and UI smoke checks confirm SVG board polygons, actual road markers, terrain fills, and no CSS `clip-path` board layout.

## Priority 6: Core Rule Integrity Hardening

- [x] U028 Add active-player and dice-sequencing regression tests.
  - Baseline: commands checked setup/game-over state but did not enforce one roll, active-player ownership, or post-roll action timing.
  - Target: encode CR-001 through CR-004 as failing tests before implementation.
  - Acceptance: tests reject non-active turn-owned commands, repeated rolls, pre-roll normal actions, and premature end turn; knight timing remains separately testable.

- [x] U029 Implement the typed turn state and common action gates.
  - Baseline: `lastDice` was display state and could not represent legal turn progression.
  - Target: add one explicit turn state owned by the domain and delegate reducer command authorization to it.
  - Acceptance: U028 passes; new/setup-complete/end-turn states enter `awaitingRoll`; non-seven rolls enter `action`; end turn clears previous-turn dice display.

- [x] U030 Add seven-roll, robber, and knight-resume regression tests.
  - Baseline: seven-roll discards were automatic, robber placement was freely clickable, and victim choice was not staged.
  - Target: encode CR-005 through CR-009 as failing tests before implementation.
  - Acceptance: tests cover exact player-selected discards, bank return, all-player completion, different-hex placement, eligible victim choice, deterministic steal, and pre/post-roll knight resume phases.

- [x] U031 Implement staged discard and robber resolution.
  - Baseline: `resolveSevenRoll` combined deterministic discard, immediate placement, and optional steal in one function.
  - Target: replace that path with explicit discard, placement, victim, and resume transitions shared by seven rolls and knights.
  - Acceptance: U030 passes and no old free-form robber command path remains active.

- [x] U032 Add phase-aware hot-seat controls.
  - Baseline: the board always moved the robber and normal action buttons did not represent turn legality.
  - Target: render discard selection and robber victim selection, constrain board interaction to placement, and reflect action availability from domain state.
  - Acceptance: product tests find the new controls and phase guidance; manual smoke completes both a seven-roll and pre-roll knight flow without an invalid hidden step.

- [x] U033 Add settlement and Longest Road integrity regression tests.
  - Baseline: normal settlements did not need to touch an owned road, and Longest Road ownership could remain stale or be awarded through an unresolved tie.
  - Target: encode CR-010 through CR-013 as failing tests before implementation.
  - Acceptance: tests cover disconnected settlement rejection, setup exemption, below-five clearing, incumbent tie retention, challenger tie clearing, unique challenger transfer, and settlement-based road blocking.

- [x] U034 Implement settlement connectivity and Longest Road transitions.
  - Baseline: placement and award logic were incomplete at the reviewed edge cases.
  - Target: enforce the normal-play connection rule and recompute ownership after roads or settlements before winner evaluation.
  - Acceptance: U033 passes and existing setup/build/classic-system tests remain green.

- [x] U035 Add Commerce Guild ledger and numeric-integrity regression tests.
  - Baseline: guild trades destroyed resource cards, redemptions and blind boxes could create cards outside the bank, and some commands accepted fractional quantities.
  - Target: encode CR-014 through CR-018 as failing tests before implementation.
  - Acceptance: tests prove per-resource conservation for trades/redemptions/rewards, whole-operation rejection for unavailable redemptions, per-resource blind-box capping, finite whole-number validation, and unchanged state after rejection.

- [x] U036 Implement Commerce Guild bank transfers and validation.
  - Baseline: each guild operation updated player state without a common local transfer discipline.
  - Target: add small module-local validation/transfer helpers without introducing a project-wide ledger abstraction.
  - Acceptance: U035 passes; existing deterministic auction and Commerce Guild tests remain green; summaries describe actual capped rewards.

- [x] U037 Run focused integration and product verification.
  - Baseline: domain slices were tested independently, but the full command/UI sequence lacked one regression gate.
  - Target: verify CR-001 through CR-018 across reducer orchestration and visible phase controls.
  - Acceptance: all three new focused test files, relevant existing product tests, and the built preview smoke pass.

- [x] U038 Complete convergence, verification, and handoff records.
  - Baseline: the update was specified and planned but had no implementation evidence or current Update Packet.
  - Target: run full verification, reconcile artifacts with implementation, and preserve one coherent internal update record.
  - Acceptance: `pnpm test`, `pnpm build`, `pnpm build:pages`, `pnpm smoke:ui`, and `git diff --check` pass; `handoff.md`, `.codex/worklog/001-catan-imitation/ledger.md`, `handoff-source.md`, and one new Update Packet describe the verified result and deferred P2 work.

## Priority 7: P2 Development Cards and Playable Ports

- [x] U039 Add development-card completion regression tests.
  - Current state: focused regression coverage now exercises all standard card effects, shared play limits, purchase-turn rejection, phase restoration, and atomic failure.
  - Target: encode CR-019 through CR-025 before implementation.
  - Acceptance: tests cover the shared per-turn limit, purchase-turn rejection, sequential free roads, early effect completion, bank-aware Year of Plenty, all-opponent Monopoly transfer, phase restoration, and unchanged state after rejection.

- [x] U040 Implement all standard development-card effects.
  - Current state: the shared card command and typed pending-effect state implement Knight, Road Building, Year of Plenty, Monopoly, and passive victory points.
  - Target: extend the existing turn-flow boundary with one typed pending development effect and small owner-module functions.
  - Acceptance: U039 passes; Knight still resumes correctly; road/resource totals and score/winner state remain correct; no generic effect engine or dependency is added.

- [x] U041 Add explicit card/effect controls.
  - Current state: the active player sees card counts, legal effect choices, remaining selections, and paused-phase guidance.
  - Target: show playable card kinds/counts, legal Road Building edges, Year of Plenty choices, Monopoly choices, remaining selections, and paused-phase guidance.
  - Acceptance: product tests verify the visible controls and action gating; no effect silently auto-selects a player choice.

- [x] U042 Add standard-port topology and gameplay regression tests.
  - Current state: deterministic topology, endpoint ownership, ratios, geometry, and visible presentation are covered by focused regression tests.
  - Target: encode CR-026 through CR-030 for deterministic coastal topology, ownership, ratios, SVG geometry, and UI presentation.
  - Acceptance: tests prove nine unique ports, eighteen distinct valid coastal endpoints, a 4+5 distribution, endpoint ownership, 4:1/3:1/2:1 ratios, and shared-geometry connector projection.

- [x] U043 Generate and wire standard ports.
  - Current state: standard board creation derives and returns nine coastal ports, and setup/demo games carry them into live state.
  - Target: derive coastal topology once, assign a deterministic standard port plan, and include it in demo/setup state.
  - Acceptance: U042 domain and geometry tests pass and existing injected-port maritime tests remain green.

- [x] U044 Render playable ports and effective ratios.
  - Current state: the island SVG renders port connectors and labels, while Maritime displays all five effective active-player ratios.
  - Target: render original port labels/connectors outside the island and show effective ratios for all five resources.
  - Acceptance: product tests and built preview smoke find port markers, port labels, ratio guidance, and responsive CSS without horizontal overflow.

- [x] U045 Complete P2 integration, review, and convergence.
  - Current state: both slices are implemented; two independent reviews found no Critical, Important, or Minor issues, and focused integration tests pass.
  - Target: review domain/UI boundaries, execute focused integration tests, and reconcile CR-019 through CR-030 with code and tasks.
  - Acceptance: no unresolved Blocker/Important review finding or CRITICAL/HIGH artifact inconsistency remains.

- [x] U046 Complete verification, records, and the requested single commit.
  - Current state: CR-001 through CR-030 passed the full test/build/Pages/smoke/render/diff gate and the records are synchronized for the requested single commit.
  - Target: run the full delivery gate, refresh outward/private handoff records, and create one commit for the complete CR-001 through CR-030 update.
  - Acceptance: `pnpm test`, `pnpm build`, `pnpm build:pages`, `pnpm smoke:ui`, rendered desktop/mobile checks, and `git diff --check` pass before the commit; the resulting working tree is clean.

## Priority 8: Frontend Completeness and Recovery

- [x] U047 Add the browser-level command recovery regression.
  - Baseline: the React-level `try/catch` cannot catch reducer update errors; an enabled zero-resource Road click unmounts the production root.
  - Target: encode CR-031 in a pure reducer test and a real-browser click before implementation.
  - Acceptance: both tests fail for the former blank-root behavior, not for environment or selector errors.

- [x] U048 Implement the safe command boundary.
  - Baseline: domain rule exceptions escape through `useReducer` processing.
  - Target: keep throwing owner modules while converting expected command errors to unchanged application state plus notice inside the exported reducer.
  - Acceptance: U047 passes; a later valid command clears notice; existing atomic-failure tests remain green.

- [x] U049 Add explicit-action interaction regressions.
  - Baseline: normal builds and Maritime choose the first heuristic candidate without player input.
  - Target: encode CR-032 through CR-034 for availability, reasons, legal targets, cancellation, and explicit resources.
  - Acceptance: tests fail until strategic choice is visible and no heuristic command dispatch remains.

- [x] U050 Implement authoritative availability and target queries.
  - Baseline: `App.tsx` independently checks phase, resources, topology, and ratios.
  - Target: compose reusable domain legality into one application selector.
  - Acceptance: selector tests cover positive and negative states without duplicating mutation logic.

- [x] U051 Implement ActionDock and board target interaction.
  - Baseline: the bottom action bar contains calculation, presentation, and dispatch heuristics in one large component.
  - Target: extract bounded components and explicit interaction modes for paid builds and Maritime.
  - Acceptance: browser tests select distinct legal targets/resources, Escape cancels, and `App.tsx` gains no rule logic.

- [x] U052 Add complete-game UI regressions.
  - Baseline: `createSetupGame` is domain-only and game-over has no restart entry.
  - Target: encode CR-035 and CR-036 before implementation.
  - Acceptance: tests cover New Game reset, all setup stages/order, first normal turn, winner display, and restart.

- [x] U053 Implement New Game, setup, and restart UI.
  - Baseline: the application always boots the prepared demo and cannot enter setup.
  - Target: reuse existing setup rules and the board target layer without a second setup path.
  - Acceptance: U052 passes and the demo remains the initial review preset.

- [x] U054 Add Commerce, accessibility, guidance, and responsive regressions.
  - Baseline: recipients can become stale, only the active player can redeem, modal focus remains behind the overlay, controls lack names/live states, and medium/mobile action layout is inefficient.
  - Target: encode CR-037 through CR-041 before the component and CSS changes.
  - Acceptance: tests use actual labels/keyboard/layout measurements rather than source strings alone where browser behavior matters.

- [x] U055 Implement bounded Commerce and dialog components.
  - Baseline: both areas live inside `App.tsx` and mix local state with shell concerns.
  - Target: extract their existing responsibility and add valid state synchronization/native dialog behavior.
  - Acceptance: no duplicate component path remains and U054 interaction tests pass.

- [x] U056 Repair guidance, touch states, resource labels, and narrow layouts.
  - Baseline: post-roll guidance mentions rolling, Wood/Wool share `Wo`, disabled controls look active, several targets are below 44px, mobile actions follow all secondary panels, and the tablet action row is fixed at 76px.
  - Target: complete CR-039 through CR-041 while preserving the current visual direction.
  - Acceptance: 1280/768/390 browser checks show no overflow, clipping, overlap, detached panel content, or ambiguous resource label.

- [x] U057 Integrate real-browser verification into delivery automation.
  - Baseline: Vitest and bundle smoke passed while the real React root could still become empty.
  - Target: make Playwright a stable local and CI delivery command.
  - Acceptance: `pnpm test:e2e` runs against a managed Vite server and CI installs only the required browser.

- [x] U058 Complete review and convergence.
  - Baseline: the audit findings are approved but not reconciled against implementation.
  - Target: map CR-031 through CR-042 to tests/code and review boundaries, behavior, and visual quality.
  - Acceptance: no unresolved P0/P1 or Critical/High finding remains; `App.tsx` loses net responsibility.

- [x] U059 Complete verification and handoff.
  - Baseline: no implementation evidence exists for the frontend repair update.
  - Target: run the full gate and synchronize outward/private records.
  - Acceptance: `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm build:pages`, `pnpm smoke:ui`, 1280/768/390 rendered review, and `git diff --check` pass; no commit or push occurs without separate authorization.
