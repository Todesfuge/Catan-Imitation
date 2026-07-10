# Feature Specification: Catan Imitation With Commerce Guild Expansion

Created: 2026-07-08
Last updated: 2026-07-10
Status: Frontend repair specification approved through CR-042
Workflow phase: Implementation verified through U059

## Feature Goal

Build a TypeScript portfolio project named Catan Imitation that recreates the recognizable online Catan experience shown in the reference screenshot while adding an original commerce and guild expansion. The project should demonstrate fast AI-assisted delivery, clean architecture, product improvement from a prototype baseline, and traceable documentation.

## Repository Target

Future work will be synchronized to `https://github.com/Todesfuge/Catan-Imitation`.

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

## Completed Update: Core Rule Integrity Hardening

This completed update corrected four high-priority rule-integrity gaps found during the post-baseline code review. It covers turn sequencing and robber resolution, normal settlement connectivity, Longest Road ownership, and Commerce Guild bank accounting.

### Turn Sequence and Command Ownership

- CR-001: Only the active player may perform turn-owned actions, including rolling dice, building, buying or playing a development card, maritime trading, completing a Commerce Guild trade slot, transferring tokens, and ending the turn.
- CR-002: Each turn starts by waiting for the active player to roll. The player may roll exactly once, and normal building, purchasing, trading, and end-turn actions are unavailable until the roll resolves.
- CR-003: A knight may be played either before the roll or during the post-roll action phase. After its robber interaction finishes, play resumes in the phase from which the knight was played.
- CR-004: Ending a turn resets the next player to the waiting-for-roll phase and clears display state that belongs only to the previous turn.

### Seven Roll and Robber Resolution

- CR-005: When a 7 is rolled, every player holding more than seven resource cards must choose exactly half their hand, rounded down, to discard.
- CR-006: A discard submission must contain non-negative whole resource counts, may not exceed the player's holdings, and must total the required discard count. Discarded resources return to the bank.
- CR-007: All required discards must finish before the active player can move the robber.
- CR-008: The robber must move to a different board hex. If one or more adjacent opponents still hold resources, the active player chooses one eligible opponent and steals one random resource from that player.
- CR-009: A robber interaction caused by a 7 resumes the post-roll action phase; one caused by a knight resumes the phase from which the knight was played.

### Settlement and Longest Road Integrity

- CR-010: Outside initial setup, a new settlement must occupy a legal vertex connected to at least one road owned by the building player.
- CR-011: Longest Road ownership must be recalculated whenever a road or settlement changes the traversable road network.
- CR-012: No player owns Longest Road when every qualifying length is below five. The current owner retains it when tied for the longest qualifying route. A unique leader takes it; if the previous owner is no longer tied and multiple challengers share the lead, the award remains unowned until the tie is broken.
- CR-013: Winner detection and displayed scores must use the recalculated Longest Road owner.

### Commerce Guild Bank Accounting

- CR-014: Resources paid into a Commerce Guild trade slot return to the bank.
- CR-015: Gathering redemption transfers the chosen resource from the bank to the player and rejects a choice when the bank lacks the requested stock.
- CR-016: Blind-box resource rewards transfer only quantities currently available in the bank. The visible result and log must report the quantity actually awarded when stock truncates the generated reward.
- CR-017: Resource, guild-token, redemption, and auction quantities must be finite non-negative whole numbers wherever zero is meaningful, and positive whole numbers where an actual transfer or bid is required.
- CR-018: An invalid command must leave game and Commerce Guild state unchanged and surface a recoverable error to the local player.

### Current Update Acceptance Signals

- A complete turn cannot be advanced, repeated, or executed on behalf of a non-active player through any exposed command.
- A 7 follows the observable sequence: player-selected discards, robber placement, victim selection when eligible, random steal, then normal actions.
- Normal settlement placement, Longest Road scoring, and winner detection remain consistent after roads are blocked or extended.
- Each Commerce Guild operation preserves the combined bank-plus-player total for every resource.
- Focused tests cover each CR-001 through CR-018 behavior, and the full test, production build, and UI smoke commands remain successful.

## Current Update: P2 Development Cards and Playable Ports

This update completes the two previously deferred gameplay areas without adding networking, persistence, a generic card engine, or randomized board generation.

### Development Card Completion

- CR-019: The active player may play at most one non-victory development card per turn. Knights, Road Building, Year of Plenty, and Monopoly share this limit, and a non-victory card cannot be played on the turn it was acquired.
- CR-020: Road Building lets the active player choose and place up to two legal roads sequentially without paying resources. The first road changes the legal choices for the second; Longest Road, score, and winner state are recalculated after each placement. The effect ends early when no legal road remains.
- CR-021: Year of Plenty lets the active player choose up to two resource cards sequentially from current bank stock, including two of the same resource. Each selected card transfers from the bank to the player, and the effect ends early when the bank has no resources.
- CR-022: Monopoly requires the active player to choose one resource type, then transfers every card of that type held by every opponent to the active player. The bank does not participate.
- CR-023: A non-victory development-card effect pauses rolling, normal actions, trading, and ending the turn until its required choices finish, then resumes the `awaitingRoll` or `action` phase from which the card was played.
- CR-024: Victory-point cards remain hidden in the owner's hand, are never played as actions, and continue to contribute one point automatically.
- CR-025: Invalid card, phase, ownership, target, inventory, or selection commands leave game state unchanged and surface through the existing recoverable error path.

### Playable Port Completion

- CR-026: The standard board contains exactly nine deterministic coastal ports using eighteen distinct coastal vertices: four generic 3:1 ports and one 2:1 port for each resource.
- CR-027: A player owns a port when that player has a settlement or city on either endpoint; ownership changes only through the current building state and needs no separate mutable flag.
- CR-028: Maritime trade uses the best applicable ratio for the resource given: matching resource port 2:1, otherwise any owned generic port 3:1, otherwise 4:1.
- CR-029: Every port is visibly rendered outside the island with its ratio/type and connections to both board endpoints, using the shared SVG geometry.
- CR-030: The active-player UI displays the effective maritime ratio for each resource, and development-card effects expose explicit road/resource choices rather than auto-selecting a result.

### P2 Acceptance Signals

- All four playable non-victory card types obey purchase-turn and one-card-per-turn restrictions and resume the correct turn phase.
- Road Building, Year of Plenty, and Monopoly preserve road/resource inventories and cannot be used to bypass normal legality.
- The fixed board exposes nine usable ports with the required 4+5 distribution and eighteen valid coastal endpoints.
- Building on either port endpoint changes the relevant maritime ratio and the visible UI agrees with the domain rule.
- Focused development-card, port-geometry, reducer, and product tests pass together with the full delivery gate.

## Current Update: Frontend Completeness and Recovery

This update turns the existing feature-rich demo into a complete, recoverable local-game interface. It preserves the verified CR-001 through CR-030 domain rules while closing the browser-level gaps found during rendered desktop, tablet, mobile, keyboard, and invalid-command review.

### Recoverable Commands and Action Availability

- CR-031: Any invalid UI command leaves all gameplay and expansion data unchanged, keeps the React application mounted, and exposes a recoverable notice. The next successful command clears the notice.
- CR-032: Every turn-owned action derives its enabled state, unavailable reason, actual cost or ratio, and legal targets from one shared application selector backed by domain rules. UI heuristics must not create a second legality path.
- CR-033: Normal Road, Settlement, and City actions require an explicit player-selected legal edge, vertex, or owned settlement. Entering a selection mode highlights only legal targets and Escape or reselecting the action cancels it.
- CR-034: Maritime trade requires explicit give and receive resource choices, shows the active ratio and bank availability, and disables submission until the selected exchange is legal.

### Complete Local Game and Commerce Flows

- CR-035: New Game starts the existing snake-order setup flow. The UI exposes each legal setup settlement and connected road choice, advances every placement pair, and enters the first normal turn after the final setup road. The initial application may continue to open the demo preset.
- CR-036: A finished game keeps the winner visible and exposes New Game without requiring a page reload.
- CR-037: Commerce Guild transfer controls always select a valid non-active recipient after turn changes. Gathering redemption lets the user select each participating player and reflects that player's tokens, remaining allowance, and current bank stock.

### Accessibility, Responsive Layout, and Guidance

- CR-038: Utility content uses a modal dialog with initial focus, Escape closing, background focus containment, and focus restoration. The Settings entry either performs a real game control action or is named according to its actual content.
- CR-039: Form controls have programmatic labels; selected modes expose state semantics; notices and relevant log changes use live regions; disabled controls are visually distinct; touch targets are at least 44 CSS pixels; Wood and Wool remain distinguishable without color alone.
- CR-040: At 1280 desktop, 768 tablet, and 390 mobile widths, the board and action workflow have no horizontal overflow, clipped text, overlapping controls, or action content outside its panel. On narrow layouts the action area follows the board before secondary information.
- CR-041: Phase guidance describes the current legal decision only and never tells a player to roll after a successful non-seven roll.
- CR-042: A real-browser regression suite runs the critical click paths for invalid-command recovery, explicit building and maritime choices, setup completion, modal keyboard behavior, and the three responsive widths. It runs alongside the existing Vitest, build, Pages, and bundle-smoke gates.

### Frontend Repair Acceptance Signals

- Reproducing the former zero-resource Road click leaves the board mounted and shows a recoverable notice.
- No normal build or maritime trade silently chooses a strategic target or resource for the player.
- A reviewer can start New Game, complete setup, play a normal turn, and start another game after victory.
- Commerce Guild redemption can be completed for more than the active player without stale recipient state.
- Keyboard and responsive browser checks pass at the approved widths, and automated browser coverage fails if the React root becomes empty.

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
  - largest army and longest road: 2 each
  - commerce guild prize card: 2
- First player to reach the configured target score wins. The default target remains 10 unless the demo mode lowers it for faster play.

## Screenshot UI Understanding

The reference UI is a desktop board-game table:

- The board dominates the left and center, with ocean background, hex tiles, ports, number chits, and clickable vertex/edge nodes.
- A vertical utility rail on the far left contains settings, rulebook/help, fullscreen, and info controls.
- The right side stacks a large game log/help area, a chat header, a bank/resource summary row, and compact player status panels.
- The bottom contains an action/status strip with the current required action, timer, command buttons, build buttons, and the active player's hand/status.
- The visual style is readable, board-game-like, and icon-heavy. Catan Imitation should evoke the layout and interaction density without copying proprietary assets.

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
- Turn-owned actions, dice sequencing, seven-roll discards, robber placement, and victim selection follow the current update requirements without allowing an invalid intermediate state.
- Settlement connectivity, Longest Road ownership, and Commerce Guild resource transfers remain correct under the reviewed edge cases.

## Assumptions

- The first version is a single-machine hot-seat demo, not an online multiplayer implementation.
- The project may use generated or CSS/SVG-like original assets to avoid copying proprietary art.
- If package installation is unavailable, the fallback is still a TypeScript-first browser project, but Vite + React remains the preferred implementation target.
