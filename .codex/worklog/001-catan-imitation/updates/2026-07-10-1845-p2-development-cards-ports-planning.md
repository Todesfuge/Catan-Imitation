# Update Packet: P2 Development Cards and Playable Ports Planning

Time: 2026-07-10 18:45
Feature: `001-catan-imitation`
Tasks: U039-U046
Requirements: CR-019 through CR-030

## Intent

Complete the two deferred P2 gameplay areas and land them together with the already verified CR-001 through CR-018 work in one commit.

## Approved Scope

- Standard one-non-victory-card-per-turn rule shared by Knight, Road Building, Year of Plenty, and Monopoly.
- Sequential explicit Road Building choices, bank-aware Year of Plenty choices, and one-resource Monopoly resolution.
- Phase pause/restoration, purchase-turn restriction, atomic error recovery, and passive hidden victory-point scoring.
- Nine deterministic coastal ports with 4 generic and 5 resource-specific types, endpoint-derived ownership, SVG rendering, and visible effective ratios.

## Decisions

- Extend the existing turn-flow state rather than create a generic effect engine.
- Reuse normal road legality through a cost-free placement path.
- Generate ports from canonical coastal topology and derive ownership from buildings.
- Add one bounded development-card UI component so `App.tsx` does not absorb effect-local state.
- Keep networking, persistence, randomized board generation, and unrelated redesign out of scope.

## Spec and Task Changes

- `spec.md`: added CR-019 through CR-030 and acceptance signals.
- `plan.md`: added owner boundaries, file map, data flow, error rules, and verification strategy.
- `tasks.md` / `update-backlog.md`: added U039-U046 with tests before implementation.
- `data-model.md`, `research.md`, `quickstart.md`, `checklists/requirements.md`, and `docs/roadmap.md`: added the approved P2 model and review criteria.

## Self-Review

- No placeholders or unresolved rule choices remain.
- Card and port requirements have explicit success signals and negative paths.
- The plan uses existing rule/UI boundaries and adds no dependency or speculative framework.
- The two slices are independently testable but share one final convergence and commit task as requested.

## Verification

- Artifact placeholder/contradiction scan completed.
- `git diff --check` passed after the planning edits.

## Handoff

Wait for written-spec approval, then begin U039 with failing tests. Do not commit until U046.
