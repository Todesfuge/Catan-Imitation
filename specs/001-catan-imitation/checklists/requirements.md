# Requirements Quality Checklist

Feature: 001-catan-imitation
Checked: 2026-07-08

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
- [x] Longest road and largest army are stretch goals, not blockers for the main demo.
- [x] AI opponents are optional, not part of the first acceptance path.
