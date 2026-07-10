# Update: Core Rule Integrity Planning

Date: 2026-07-10 15:50
Feature: 001-catan-imitation
Related tasks: CR-001-CR-018, U028-U038 planning
Related commits / PR: pending

## Intent

Resume the completed U027 baseline, convert the post-review P1 findings into one approved and testable update, and pass the Spec Kit artifact gate before changing production behavior.

## Scope

- Strict active-player and dice sequencing.
- Player-selected seven-roll discards, staged robber placement, selected victim, and knight resume behavior.
- Normal settlement road connectivity and complete Longest Road ownership transitions.
- Commerce Guild bank conservation and numeric validation.
- Deferred: development-card completeness and playable port placement.

## Code Changes

- None. This packet records specification, planning, task generation, and artifact analysis only.

## Spec / Task Changes

- `spec.md`: added approved CR-001 through CR-018 requirements and acceptance signals.
- `checklists/requirements.md`: added ambiguity, testability, and scope checks for the update.
- `plan.md`: added boundary decisions, data flow, error handling, file map, TDD gates, and minimalism/constitution checks.
- `research.md`: recorded selected/rejected approaches and resolved technical unknowns.
- `data-model.md`: defined turn phases, pending discard/robber state, command changes, and resource-ledger invariants.
- `tasks.md`: appended U028-U038 without changing prior task numbering.
- `update-backlog.md`: added detailed acceptance criteria for every new task.
- `quickstart.md` and `docs/roadmap.md`: added the manual scenario and ready-for-implementation milestone.

## Decisions

- Decision: use one explicit domain turn state and one `turnFlow.ts` owner.
- Reason: independent reducer booleans can represent contradictory discard/robber states and would grow an existing hotspot.
- Alternatives: reducer-only flags; generic event engine.
- Reversibility: medium. Commands and `GameState` gain explicit state, but the behavior remains pure and local.

- Decision: keep Commerce resource-transfer helpers local to the expansion module.
- Reason: it fixes the approved accounting gap without broadening the update into a cross-project ledger refactor.
- Alternatives: global resource repository/helper module.
- Reversibility: high. A later repeated use case can extract the proven local operations.

## Verification

- Command: requirement/task coverage scan.
- Result: 18 unique requirements CR-001-CR-018 and 11 ordered tasks U028-U038.
- Command: placeholder/stale marker scan across Spec Kit artifacts.
- Result: no markers found after correcting the baseline plan tree and data-model command table.
- Command: checklist scan.
- Result: no unchecked requirement-quality items.
- Command: `git diff --check`.
- Result: no whitespace errors; Windows line-ending warnings only.
- Artifact analysis: 0 CRITICAL, 0 HIGH, 1 MEDIUM deferred handoff refresh tracked by U038.

## Risks / Follow-ups

- The strict turn flow changes the shape of `GameState` and several reducer commands; focused tests must land before implementation.
- `App.tsx` remains a baseline hotspot, so new discard/victim UI belongs in `src/ui/TurnFlowPanel.tsx`.
- Existing external `handoff.md` remains a baseline snapshot until U038 reconciles final behavior and evidence.

## Handoff

Begin U028 by writing failing tests for active-player authorization, one-roll sequencing, pre-roll action rejection, end-turn gating, and next-turn reset. Do not implement U029 until those tests fail for the expected missing-state reasons.
