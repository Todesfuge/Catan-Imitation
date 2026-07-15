# Artifact Analysis: Comprehensive In-Game Rulebook

Date: 2026-07-15
Scope: `spec.md`, `checklists/requirements.md`, `research.md`, `plan.md`, `tasks.md`, `quickstart.md`
Method: manual Spec Kit-equivalent analysis because no `speckit-analyze` tool is available in this session.

## Gate Result

- CRITICAL findings: 0
- HIGH findings: 0
- MEDIUM findings: 0
- LOW findings: 1, recorded below
- Implementation gate: PASS

## Coverage

| Requirement group | Spec | Plan owner | Task owner | Independent evidence |
| --- | --- | --- | --- | --- |
| RB-001–RB-006 information architecture/static boundary | complete | Rulebook content/panel/dialog boundaries | T001/T002 | SSR semantics + reopen browser case + no-state guard |
| RB-007–RB-014 Quick Start | complete | `RulebookContent.tsx` Quick Start | T001 | bilingual topic/example assertions |
| RB-015–RB-022 Base Rules | complete | authoritative costs + Base Rules content | T001 | cost bundles + development/robber/scoring assertions |
| RB-023–RB-032 Commerce Guild | complete | Commerce Guild content baseline | T001 | slot/cooldown/redemption/auction/termination assertions |
| RB-033–RB-038 Quick Reference | complete | compact facts and final sentinel | T001 | bilingual reference coverage + final sentinel |
| RB-039–RB-041 localization/icons | complete | existing i18n + `messages.ts` + shared icons | T001/T002 | catalog parity + live switch + accessible icon evidence |
| RB-042–RB-044 tabs/focus | complete | native ARIA tabs + existing dialog lifecycle | T002 | SSR relationships + keyboard/Escape/focus browser cases |
| RB-045–RB-048 scrolling/responsive states | complete | rulebook-only CSS boundary | T002 | desktop/390 containment and scroll-to-end browser cases |
| RB-049–RB-050 correctness/no gameplay change | complete | authoritative imports + static component API | T001/T002/T003 | rendered cost proof + domain/Online/Worker/package no-diff guard |
| RB-051–RB-054 verification | complete | dedicated Vitest/Playwright and release gates | T001/T002/T003 | focused/main/E2E/build/smoke/guard/diff evidence |

All 54 numbered requirements have an implementation owner and a named verification path. Each user story can be reviewed independently: tutorial content, base reference, Commerce Guild reference, and accessible navigation.

## Consistency Checks

### Static content versus target score

The specification requires static content but refers to the configured target. The plan resolves this without accepting game state: rulebook prose tells the player to use the target displayed by the game. No target-score prop or state-dependent branch is planned.

### Live language switching

The existing language selector is inside Settings and cannot be operated while Rulebook is open. Research and T002 resolve RB-040 with a compact selector inside the rulebook that calls the existing session `setLocale`; it creates no independent preference. The tablist remains first in DOM order so the specified keyboard entry path is preserved.

### Reopen reset versus locale retention

The rulebook panel unmounts when the modal closes, so reopening resets to Quick Start. A locale change rerenders the mounted panel without unmounting it, so the selected chapter remains. The two requirements use distinct lifecycle events and do not conflict.

### Sticky navigation versus existing modal scrolling

Only `.modal-card--rulebook` changes to a fixed-header/internal-body layout. Generic `.modal-card` retains the scrolling behavior required by Settings restart confirmation and Info. No unrelated dialog behavior is broadened.

### Thin UI versus authoritative values

The UI imports `buildCosts` for display but performs no transition or legality calculation. Other current facts are explanatory copy protected by focused assertions; game rules remain in pure domain modules.

## Boundary and Minimalism Checks

- `UtilityDialog.tsx` gains delegation and a modifier class only; it does not gain chapter state or copy.
- The 1,847-line `frontend-recovery.spec.ts` gains no planned rulebook tests.
- `i18n.ts` gains one feature-catalog spread and loses four obsolete messages.
- No generic content renderer, Markdown parser, dependency, route, service, second locale store, second icon map, or rules engine is planned.
- No domain, protocol, Worker, persistence, projection, package, or lockfile edit appears in the file map.
- Three production files are created because navigation behavior, semantic chapter markup, and long-form translation data have separate responsibilities; this is a responsibility boundary, not speculative extensibility.

## LOW Finding L-001: Some rule facts remain explanatory literals

Ratios, award thresholds/points, and Commerce Guild values are not all exported as one presentation-ready constants object. Creating such an object would broaden the domain API solely for documentation and is not justified by this feature.

Mitigation:

- import the already-stable `buildCosts` values directly;
- state every remaining current value explicitly in `plan.md`;
- require focused bilingual content assertions for those values/effects;
- require whole-feature review against the cited domain owners;
- leave game/domain files unchanged.

Residual risk is low and accepted for planning; a later gameplay change must update the focused content test before it can pass.

## Task Quality Checks

- T001 and T002 each have an independently reviewable deliverable and explicit RED/GREEN commands.
- T001 produces the interfaces T002 consumes.
- T003 contains fresh full gates, review, convergence, evidence, and handoff rather than implementation work by default.
- Every production change has exact file paths and a narrow proof.
- No parallel marker hides shared-file conflicts.
- No unresolved `TBD`, `TODO`, implementation placeholder, or second durable plan exists.

## Conclusion

The approved specification, technical plan, and task list are mutually consistent and ready for T001 implementation. No blocking artifact finding remains.
