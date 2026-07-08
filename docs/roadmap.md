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

## Future Milestones

Status: Planned

- Automated browser-level UI smoke tests for click flows and responsive screenshots.
- True shared board-intersection model instead of demo-oriented geometry.
- Stronger port art and port ownership visualization.
- Optional persistence or real-time multiplayer layer.
