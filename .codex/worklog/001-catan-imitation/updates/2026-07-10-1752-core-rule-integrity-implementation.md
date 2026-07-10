# Update Packet: Core Rule Integrity Implementation

Time: 2026-07-10 17:52
Feature: `001-catan-imitation`
Tasks: U028-U038
Requirements: CR-001 through CR-018

## Outcome

Implemented the approved core-rule integrity update and reconciled the public feature artifacts with the code. The update stays within the accepted scope: strict turn ownership, staged seven/robber handling, settlement and Longest Road correctness, and Commerce Guild conservation/validation.

## Design and Boundary Decisions

- Added one typed `TurnState`/`TurnPhase` model instead of inferring legality from display-only dice state.
- Kept robber orchestration in a small domain rule module and the reducer; React only renders phase-aware controls and dispatches commands.
- Preserved setup settlement exemptions while enforcing owned-road connectivity during normal play.
- Recomputed Longest Road after road and settlement topology changes before winner evaluation.
- Added Commerce Guild module-local validators and bank transfers rather than a speculative project-wide ledger abstraction.
- Deferred development-card completeness and playable port placement as P2 work.

## TDD and Review Evidence

- Added `turnFlow.test.ts`, `ruleIntegrity.test.ts`, and `commerceGuildIntegrity.test.ts` before their corresponding implementations.
- Used red-green cycles for authorization, staged robber flow, Longest Road transitions, bank conservation, numeric/RNG validation, and the final yield-format regression.
- Independent review passes found and closed coverage gaps for turn ownership, robber accessibility/gating, road winner ordering, Commerce Guild zero outcomes, RNG bounds, atomic rejection, and per-resource conservation.
- Final Commerce Guild review returned no Blocker, Important, or Minor findings and marked U035-U036 Ready.

## Main Implementation Areas

- `src/domain/types.ts`
- `src/domain/rules/turnFlow.ts`
- `src/app/gameReducer.ts`
- `src/ui/TurnFlowPanel.tsx`
- `src/domain/rules/building.ts`
- `src/domain/rules/longestRoad.ts`
- `src/domain/expansion/commerceGuild.ts`
- `src/App.tsx`
- `scripts/smoke-ui.mjs`

## Verification

- Focused CR/product gate: 4 files, 42 tests passed.
- Full verified baseline: 13 files, 75 tests passed.
- Production build passed after the final code change.
- Built preview smoke passed with the new visible workflow assertions.
- Rendered desktop/mobile review found no P0 blocker; expected-yield number formatting was the only P1 issue and was fixed under test.
- The final U038 command gate passed after this packet and handoff were written; a whitespace-only diff-check finding was corrected and rechecked.

## Remaining Risks

- Externally restored Commerce Guild historical state is not validated because persistence is not currently a system boundary.
- Development-card completeness and playable port placement remain P2.
- Browser-level click-flow automation remains future delivery work; current UI smoke checks the built preview and bundle contracts.

## Handoff

Review the local diff. Commit and push only after explicit approval.
