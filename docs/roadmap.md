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

- Automated browser-level UI smoke tests for click flows and responsive screenshots.
- Generalized board generation beyond the current fixed 19-hex shared topology.
- Optional persistence or real-time multiplayer layer.

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
