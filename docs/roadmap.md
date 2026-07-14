# Roadmap

This roadmap groups the project into reviewable milestones. It is intentionally compact so a reviewer can see what is complete, what is still planned, and how future work should be verified.

## Milestone 1: Rules Foundation

Status: Complete

- Standard resource, player, board, bank, setup, turn, production, robber, building, scoring, and winner flows.
- Development cards, Largest Army, Longest Road, maritime trade, and port-ratio support.
- Verification: unit tests for production, setup/build legality, classic systems, and scoring.

## Milestone 2: Commerce Guild Expansion

Status: Complete

- Shared three-slot Commerce Guild market.
- Once-per-turn resource-to-token trades.
- Token transfer between players.
- Gathering redemption phase, three-round blind-box auction, voucher redemption, and prize-card scoring.
- Verification: domain tests for trade slots, gathering, auctions, deck rewards, transfer naming, and prize scoring.

## Milestone 3: Product Polish

Status: Complete

- Connected utility rail with settings, rulebook, info, and fullscreen controls.
- Guided phase prompt and recoverable toast errors.
- More inspectable board visuals with terrain badges and dice-pip number tokens.
- Activity summary replacing the nonfunctional chat shell.
- Mobile and tablet layout hardening.
- Verification: product-polish tests plus browser smoke at desktop, mobile, and tablet widths.

## Milestone 4: Delivery Automation

Status: Complete

- GitHub Actions CI for install, tests, production build, and UI smoke.
- GitHub Pages deployment workflow for the static Vite bundle.
- Stable local `pnpm smoke:ui` command.
- Pull request and issue templates with verification expectations.
- Verification: delivery-readiness tests, full test suite, build, and smoke command.

## Other Future Milestones

Status: Ready for implementation

- Optional accounts, public matchmaking, and cross-device seat recovery.
- Long-term saved games and resumed-room lifecycle controls.
- AI players and non-standard board sizes or topologies beyond the standard 19-hex map.

## Milestone 5: Core Rule Integrity Hardening

Status: Complete

- Explicit active-player and once-per-turn dice state.
- Player-selected seven-roll discards followed by staged robber placement and victim selection.
- Normal settlement road connectivity and complete Longest Road ownership transitions.
- Commerce Guild resource conservation through the shared bank.
- Verification: focused TDD slices for turn flow, rule integrity, and guild accounting, followed by the full delivery gate.

## Milestone 6: Development Cards and Playable Ports

Status: Complete

- One playable non-victory development card per turn with purchase-turn restrictions.
- Sequential Road Building, bank-aware Year of Plenty, and all-opponent Monopoly effects.
- Nine deterministic standard coastal ports with live ownership, 4:1/3:1/2:1 ratios, and SVG presentation.
- Explicit effect-choice controls and per-resource maritime ratio guidance.
- Verification: focused card/port/product TDD slices, implementation review, rendered responsive checks, and the full delivery gate.

## Milestone 7: Frontend Completeness and Recovery

Status: Complete

- Recoverable reducer command boundary that cannot blank the React root.
- Shared action availability and explicit normal build, maritime, and setup choices.
- Complete New Game, game-over restart, and multi-player Commerce Guild gathering UI.
- Accessible dialog, forms, dynamic notices, disabled states, and touch targets.
- Board-adjacent action workflow across 1280 desktop, 768 tablet, and 390 mobile layouts.
- Playwright click-flow and responsive regression coverage in the delivery gate.
- Verification: 108 Vitest checks, 12 production-preview Playwright flows, production/Pages builds, UI smoke, rendered 1280/768/390 review, and focused code-review convergence.

## Milestone 8: Readability, Public Trade, and Chinese Localization

Status: Complete

- High-contrast robber and turn-flow overlays.
- Scrollable Game Log and Yield Statistics dice results inside the fixed game shell.
- One public multi-resource player offer per action phase with any eligible opponent acceptance.
- English-default interface with session-persistent Simplified Chinese switching and translated historical logs.
- Complete reciprocal English and Chinese README documents.
- Production-preview browser coverage for contrast, scrolling, trade, locale, and responsive containment.
- Verification: 120 Vitest checks, 17 production-preview Playwright flows, production/Pages builds, bundle smoke, rendered English/Chinese 1280 and mobile 390 review, and converged independent code review.

## Milestone 9: Seeded Random Maps

Status: Complete

- Deterministic randomized standard 19-hex maps with fixed terrain, number-token, and port multisets plus bounded red-token and coastal-port constraints.
- Canonical public `M1-` seeds that reconstruct identical stable geometry in Local Game, the Worker, and every connected browser.
- Real empty Local setup and shared same-map/new-map restart transitions that clear gameplay and Commerce Guild state atomically.
- Public bilingual seed/copy controls with a selectable manual fallback, explicit confirmation, host-only Online restart authority, and converged room-version broadcasts.
- Storage schema v2 and protocol v2 with exact fixed-board v1 migration through reserved `M0-STANDARD`; new games never emit the compatibility seed.
- Verification: 1,000-seed invariants, golden layouts, Local/Worker/protocol/migration/restart suites, three-context Playwright convergence, responsive screenshots, and the release evidence recorded in the seeded-map handoff.

## Milestone 10: Gathering Pacing and Resource Iconography

Status: Complete pending final whole-branch review

- One authoritative table-wide Commerce Guild cooldown: `2n` on new/restarted matches, `n` after a manual start, with the initiating turn excluded and no automatic gathering trigger.
- Current-player, clean-action-phase authority in Local and Online play, with exact no-payload public commands, caller-derived identity, shared projection, and reconnect-safe storage schema v3 migration.
- Atomic second-settlement setup resources from every adjacent producing hex, including equal bank debit and exact-once behavior.
- One filled, accessible resource-icon system across operational controls, hands, bank, statistics, ports, and board hexes; explanatory prose and localized assistive semantics retain complete names.
- Verification: focused domain/Worker/UI suites, four-player Local and three-isolated-caller Online cooldown vectors, exact setup-grant browser coverage, bilingual desktop/mobile icon and scroll checks, release gates, and the feature verification record.
