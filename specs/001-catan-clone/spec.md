# Feature Specification: Catan Clone With Commerce Guild Expansion

Created: 2026-07-08
Status: Draft for user review
Workflow phase: Specification

## Feature Goal

Build a TypeScript portfolio project that recreates the recognizable online Catan experience shown in the reference screenshot while adding an original commerce and guild expansion. The project should demonstrate fast AI-assisted delivery, clean architecture, product improvement from a prototype baseline, and traceable documentation.

## Users and Actors

- Candidate / presenter: demonstrates the project in an interview or portfolio review.
- Local players: operate a 3-4 player hot-seat game on one browser.
- Reviewer / engineer: inspects docs, code boundaries, and verification evidence.

## In Scope

- A browser-based TypeScript game prototype using Vite, React, and pure domain modules.
- A Catan-like board with 19 land hexes, ports, number tokens, robber, roads, settlements, and cities.
- Core local rules: setup placement, dice roll, resource production, basic robber handling, build costs, victory points, turn progression, and local player state.
- UI layout inspired by the supplied online game screenshot:
  - central island board on blue ocean
  - left utility rail
  - right log/chat/resource-bank/player panels
  - bottom action bar and current player controls
- Statistics panel with three query modes:
  - player-focused expected income by dice outcome and probability
  - dice-focused distribution showing which players gain which resources
  - full expected income matrix across players, dice totals, and resources
- Original Commerce Guild expansion:
  - shared trade board with three rotating trade slots
  - once-per-player-turn conversion of listed resources into guild tokens
  - transferable tokens between players
  - periodic guild gathering with resource redemption and blind-box auctions
  - vouchers redeemable into prize cards worth 2 victory points each
- Documentation that records goals, rules interpretation, implementation plan, task breakdown, and handoff notes.
- Unit tests for pure rule modules where risk is highest: resource production, statistics, and commerce guild state transitions.

## Out of Scope

- Real-time online multiplayer, accounts, matchmaking, database persistence, or server authority.
- Exact duplication of proprietary artwork, sound, branding, or hidden implementation details from any commercial product.
- Full ranked-game enforcement of every edge rule when it would prevent a two-hour playable demo.
- AI opponents beyond optional simple automation for demonstration.
- Mobile-first redesign. The initial target is desktop browser, with responsive guardrails where cheap.

## Core Catan Rule Understanding

- The standard board has terrain that produces wood, brick, wool, grain, and ore; desert does not produce resources.
- Each non-desert terrain has a dice number from 2-12 except 7. A dice total produces resources for adjacent settlements and cities unless blocked by the robber.
- Settlements produce 1 resource; cities produce 2.
- A 7 triggers robber behavior. In the MVP, players above the hand limit discard half, the current player moves the robber, and may steal one random resource from an adjacent opponent if available.
- Build costs:
  - road: 1 wood + 1 brick
  - settlement: 1 wood + 1 brick + 1 wool + 1 grain
  - city: 2 grain + 3 ore
  - development card: 1 wool + 1 grain + 1 ore
- Victory points:
  - settlement: 1
  - city: 2
  - victory point development card: 1
  - largest army and longest road are planned stretch goals for the two-hour run
  - commerce guild prize card: 2
- First player to reach the configured target score wins. The default target remains 10 unless the demo mode lowers it for faster play.

## Screenshot UI Understanding

The reference UI is a desktop board-game table:

- The board dominates the left and center, with ocean background, hex tiles, ports, number chits, and clickable vertex/edge nodes.
- A vertical utility rail on the far left contains settings, rulebook/help, fullscreen, and info controls.
- The right side stacks a large game log/help area, a chat header, a bank/resource summary row, and compact player status panels.
- The bottom contains an action/status strip with the current required action, timer, command buttons, build buttons, and the active player's hand/status.
- The visual style is readable, board-game-like, and icon-heavy. The clone should evoke the layout and interaction density without copying proprietary assets.

## Statistics Panel Requirements

### Player Query

Given one player, show each dice total from 2-12, its probability, the resources that player would receive if rolled now, and the expected value contribution by resource. The current robber position, settlement/city production count, and terrain resources must be reflected.

### Dice Query

Given one dice total, show every player who would receive resources, including resource type and amount. This view answers "what happens when this number appears?"

### Full Matrix

Show a complete table combining players, dice totals, probabilities, and resource totals. Include per-player expected value summaries by resource and total expected resources per roll.

## Commerce Guild Expansion Requirements

### Trade Slots

- The shared trade board has exactly three visible slots.
- A slot describes required resources and token reward.
- Each player may complete at most one slot trade during their own turn.
- After a slot is completed, that slot refreshes immediately from the offer generator.

### Tokens

- Tokens are not resources and cannot normally be converted into resources.
- Tokens may be transferred between players.
- Token movement must be visible in the log.

### Guild Gathering

- A gathering occurs every configured interval, defaulting to every 6 completed rounds for the demo.
- The UI may also expose a manual trigger for interview demonstration.
- Phase 1: each player may spend tokens at 1 token to 1 chosen resource, up to 4 total resources per player per gathering.
- Phase 2: run three auction rounds. Each round auctions one blind box.
- Highest bid wins the blind box and pays tokens. Ties resolve by current turn order from active player onward.

### Blind Box Outcomes

- 50%: gain 2-4 random resources.
- 30%: gain one voucher.
- 20%: gain one random development card.
- Three vouchers may be redeemed for one prize card.
- Each prize card is worth 2 victory points.
- Prize redemption is unlimited.

## Success Criteria

- A reviewer can start the app, see a recognizable Catan-like table, and perform a local turn loop.
- Rolling dice updates resources according to board state.
- The statistics panel matches the same production logic used by the game.
- Commerce guild slots, token trades, gatherings, auctions, vouchers, and prize scoring are operable in the UI.
- The codebase has clear domain/UI boundaries and typed state.
- The project contains enough docs for another engineer to understand scope, architecture, and remaining work.
- Build and focused tests pass before the project is presented as complete.

## Assumptions

- The first version is a single-machine hot-seat demo, not an online multiplayer implementation.
- The project may use generated or CSS/SVG-like original assets to avoid copying proprietary art.
- If package installation is unavailable, the fallback is still a TypeScript-first browser project, but Vite + React remains the preferred implementation target.

