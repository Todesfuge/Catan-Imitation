# Specification Quality Checklist: Gathering Pacing, Setup Grants, and Resource Iconography

Reviewed: 2026-07-14
Artifact: `specs/004-gathering-pacing-resource-icons/spec.md`

## Scope and User Value

- [x] Gathering pacing, authoritative initiation, setup resource grants, and resource icon clarity are independently described.
- [x] Local, Online, keyboard, assistive-technology, migration, and operator actors are explicit.
- [x] Auction rules, redemption caps, bypass mechanics, real-time timers, new resources, external icons, and prose icon replacement are explicitly out of scope.
- [x] The six-round automatic trigger is explicitly superseded without rewriting historical specifications.

## Cooldown Semantics

- [x] `n`, a cooldown turn, the initial `2n`, table `n`, and personal `n²-n` durations are defined.
- [x] Setup does not consume cooldowns and the initiating turn is excluded.
- [x] Current-player, normal-action-phase, idle-phase, table, and personal gates are all explicit.
- [x] Independent player histories, restart reset, gathering completion, and zero clamping are testable.
- [x] Absolute turn targets plus duration caps are authoritative and do not rely on browser time or per-turn batch mutation.

## Online Authority and Migration

- [x] The public command omits actor identity and the authenticated Worker boundary supplies it.
- [x] Public table and private caller cooldown projections are distinguished.
- [x] Storage and wire schema v3 requirements are explicit.
- [x] v2 lobby, idle/complete match, and active gathering migrations have deterministic baselines.
- [x] Migration validation, atomic persistence, idempotency, version checks, reconnect, and recovery behavior are retained.

## Setup Grant Correctness

- [x] Only the second setup settlement awards resources.
- [x] Every adjacent producing hex contributes independently and desert contributes nothing.
- [x] Player credit, bank debit, building placement, and setup progression form one atomic transition.
- [x] Duplicate award paths and insufficient-bank behavior are explicit.
- [x] Local and Online share one pure domain rule.

## Icon and Accessibility Contract

- [x] Every resource has a stable distinct icon, semantic color, quantity, and localized accessible name.
- [x] Operational, state, statistics, port, and board scopes are explicit.
- [x] Rules, help, logs, and explanatory prose retain natural-language resource names.
- [x] Board terrain text and abbreviations are removed visually while semantic names remain accessible.
- [x] Desert behavior, zero quantities, tooltips, keyboard access, localization, desktop, and mobile expectations are explicit.
- [x] The implementation reuses the installed icon library and forbids duplicate mappings or new external assets.

## Verification and Structure

- [x] Domain, client, Worker, migration, reconnect, browser, accessibility, localization, build, smoke, dry-run, guard, and diff evidence are required.
- [x] Three- and four-player deterministic vectors provide measurable cooldown acceptance.
- [x] Local and multiple isolated Online callers are required in browser evidence.
- [x] Domain, command-composition, setup, and presentation owners are identified without adding business logic to UI or Worker facades.
- [x] No unresolved placeholder, TODO, TBD, contradiction, or ambiguous scope remains.

## Result

The approved design is represented as a testable Spec Kit specification and is ready for user written-spec review before technical planning.
