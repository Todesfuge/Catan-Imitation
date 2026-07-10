# Requirements Quality Checklist

Feature: 001-catan-imitation
Checked: 2026-07-10

## Completeness

- [x] Users and actors are identified.
- [x] In-scope and out-of-scope behavior are explicit.
- [x] Core Catan rule understanding is documented.
- [x] Screenshot UI interpretation is documented.
- [x] Statistics panel has all three requested query modes.
- [x] Commerce Guild expansion rules are documented.
- [x] Success criteria are observable.

## Testability

- [x] Resource production can be tested with fixed board state and dice total.
- [x] Statistics can be tested against the same production function.
- [x] Trade slot refresh and once-per-turn limits can be tested.
- [x] Guild gathering redemption caps can be tested.
- [x] Auction resolution and blind-box outcome application can be tested.
- [x] Prize card scoring can be tested.

## Ambiguity Review

- [x] "Unlimited redemption" is interpreted as unlimited prize redemption; phase-1 resource redemption is capped at 4 resources per player per gathering.
- [x] "Every once in a while" is configured as every 6 completed rounds by default, with a manual demo trigger.
- [x] Tokens are transferable but have no normal conversion path outside guild gatherings.
- [x] Blind-box randomness will be injected through a random source so tests can be deterministic.

## Scope Control

- [x] Online multiplayer is excluded from the two-hour MVP.
- [x] Proprietary art and branding are excluded.
- [x] Longest Road, Largest Army, all standard development-card effects, and playable standard ports are implemented classic systems.
- [x] AI opponents are optional, not part of the first acceptance path.

## Core Rule Integrity Update

- [x] The active-player boundary and once-per-turn dice sequence are explicit.
- [x] Knight timing before and after the roll has one unambiguous resume rule.
- [x] Seven-roll discards specify player choice, exact counts, validation, ordering, and bank return.
- [x] Robber placement specifies a different hex, eligible opponents, player-selected victim, and random resource selection.
- [x] Normal settlement road connectivity is distinct from setup placement.
- [x] Longest Road threshold, incumbent tie, challenger tie, recalculation, and score effects are testable.
- [x] Commerce Guild trade, redemption, and blind-box resource movement specifies bank behavior under normal and short-stock conditions.
- [x] Numeric inputs and invalid-command state preservation are explicit.
- [x] Development-card completeness and playable port placement were excluded from CR-001 through CR-018 and are now separately specified as CR-019 through CR-030.

## P2 Completion Review

- [x] One-card-per-turn and purchase-turn restrictions cover every playable non-victory card.
- [x] Road Building defines sequential legal choices, free placement, early completion, and Longest Road/winner recalculation.
- [x] Year of Plenty defines player choice, same-resource selection, bank stock, conservation, and early completion.
- [x] Monopoly defines the selected resource, all-opponent transfer, and bank exclusion.
- [x] Development-card effects define paused commands, phase restoration, explicit UI choice, and atomic rejection.
- [x] The standard port count, type distribution, coastal endpoints, ownership, ratios, and SVG presentation are testable.
- [x] Networking, persistence, generalized card engines, and randomized board generation remain excluded.

## Frontend Completeness Review

- [x] Invalid-command recovery specifies unchanged gameplay state, a mounted React root, a notice, and success clearing.
- [x] Action availability has one authority and covers enabled state, reason, cost or ratio, and legal targets.
- [x] Normal building and maritime interactions require explicit player choices and cancellation behavior.
- [x] New Game, snake-order setup, game-over restart, and demo-preservation behavior are unambiguous.
- [x] Commerce Guild transfer and per-player gathering state are specified across turn changes.
- [x] Dialog, form-label, live-region, disabled, touch-target, and non-color-only requirements are testable.
- [x] Desktop, tablet, and mobile ordering and overflow expectations use exact review widths.
- [x] A real-browser regression suite is required in addition to existing unit/build/smoke gates.
- [x] Networking, persistence, randomized boards, AI players, and a global state-machine rewrite remain excluded.
