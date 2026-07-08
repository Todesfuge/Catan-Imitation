# Update: Ordered Update Backlog

Date: 2026-07-08 18:55
Feature: 001-catan-imitation
Related tasks: U001-U024
Related commits / PR: pending

## Intent

Record all known unfinished or improvable work after the MVP and put it into an ordered update queue.

## Scope

This is an artifact-only update. No source code or runtime behavior changed.

## Code Changes

- None.

## Spec / Task Changes

- `specs/001-catan-imitation/update-backlog.md`: added ordered backlog U001-U024 with current state, target, and acceptance criteria.
- `specs/001-catan-imitation/tasks.md`: replaced loose stretch tasks with ordered U001-U024 tasks.
- `specs/001-catan-imitation/handoff.md`: pointed next steps to the ordered backlog and clarified implementation sequence.

## Decisions

- Decision: order follow-up work as core rules, classic systems, Commerce Guild polish, product polish, then delivery automation.
- Reason: rule correctness affects the most downstream behavior; UI and delivery work are easier to verify after rules stabilize.
- Alternatives: prioritize UI polish or deployment first.
- Reversibility: low-cost; backlog order can be amended as interview needs change.

## Verification

- Command: `rg -n "update-backlog|U001|U024|S001|S002|S003|S004|S005" specs\001-catan-imitation`
- Result: U001/U024 appear in backlog and tasks; handoff points to `update-backlog.md`; old S001-S005 entries are absent.
- Command: `git diff --check`
- Result: no whitespace errors.

## Risks / Follow-ups

- U001-U006 are the next highest-value engineering tasks.
- CI/deployment tasks U020-U024 should follow after rule behavior is less volatile.

## Handoff

Start next implementation pass with U001 unless the user reprioritizes.
