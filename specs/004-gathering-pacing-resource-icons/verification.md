# Gathering Pacing, Setup Grants, and Resource Icons Verification

Status: Complete; release gates and whole-branch independent review passed

Verified on 2026-07-15 from branch `codex/gathering-cooldowns-icons`. The feature range begins after `main` commit `7434a04` and currently ends at the T007 verification commit checked out at `HEAD`; this self-referential artifact identifies that commit by position rather than embedding an impossible final SHA.

Whole-branch independent review: passed over `7434a04..HEAD`; final assessment `Ready to merge: Yes` with no Critical or Important findings

## Current Targeted Evidence

| Gate | Current result |
| --- | --- |
| Local setup grant | `pnpm exec playwright test --project=local-preview --grep "Local setup grants each second settlement"`: 1 test passed. |
| Four-player Local cooldown | `pnpm exec playwright test --project=local-preview --grep "four-player Local gathering cooldown"`: 1 test passed. |
| Three-player Online authority | `pnpm exec playwright test --project=online-worker --grep "three isolated callers share cooldown authority"`: 1 test passed. |
| Bilingual board/icon presentation | `pnpm exec playwright test --project=local-preview --grep "renders icon-only board resources with accessible semantics"`: 2 tests passed. |
| Chinese mobile scrolling | `pnpm exec playwright test --project=local-preview --grep "Chinese mobile keeps log"`: 1 test passed. |
| Keyboard maritime selection | `pnpm exec playwright test --project=local-preview --grep "explicit maritime choices fund a selected Road target for M1-0000000000000000"`: 1 test passed. |
| Review-fix component focus | Localization, resource presentation, gathering cooldown, frontend accessibility, and product polish: 5 files and 61 tests passed. Counts `0`/`1`/`2` and English/Chinese parent-button tooltips are covered. |
| Review recheck grammar focus | Localization, resource presentation, game-log fallbacks, and domain transitions: 4 files and 59 tests passed. Counts `0`/`1`/`2` cover roads, transfers, and auction summaries/logs in English with retained Chinese output. |
| Review-fix browser focus | Cooldown, maritime, keyboard, and English/Chinese resource-icon paths: 5 tests passed. |
| Documentation/localization focus | `pnpm vitest run test/domain/deliveryReadiness.test.ts test/domain/localization.test.ts`: 2 files and 15 tests passed. |
| Domain/client suite | `pnpm test`: 36 files and 502 tests passed, including the 1,000-seed invariant. |
| Worker suite | `pnpm test:worker`: 9 files and 277 tests passed. Windows reported non-fatal Miniflare `EBUSY` cleanup warnings after the successful exit. |
| Browser suite | `pnpm test:e2e`: 55 tests passed across `local-preview` and `online-worker` in 2.2 minutes. |
| SPA and Worker builds | `pnpm build` transformed 1,625 modules and built the SPA; `pnpm build:worker` completed the same SPA build plus `tsc -p tsconfig.worker.json`. |
| UI and Worker smoke | `pnpm smoke:ui` passed the board/trade/localization/scroll/responsive contract; `pnpm smoke:worker` passed headers, SPA, room API, single-use ticket, and WebSocket snapshot. |
| Wrangler dry-run | Wrangler 4.110.0 read 4 asset files, produced 236.32 KiB / 48.93 KiB gzip, and resolved `ROOMS` plus `ASSETS`; `--dry-run` exited without deployment. |
| Repository guards and whitespace | All guard assertions passed with zero unexpected matches; `git diff --check` exited 0 with no whitespace errors (only the repository's Windows line-ending notices). |
| Artifact convergence | Final `spec.md`, `plan.md`, and `tasks.md` were compared against implementation and evidence. No unmatched requirement or new implementation task was found; the fixed Local roster wording discrepancy remains documented below. |

The task wording asks for both three- and four-player Local browser cooldown vectors, but the approved product exposes Local Game only as a fixed four-seat hot-seat mode. Evidence therefore uses the supported four-player Local UI and a real three-player room with three isolated Online callers. This matches GP-046 (automated three/four-player math) and GP-047 (Local presentation plus isolated Online callers) without adding a test-only Local roster hook.

## Requirement Evidence

| Requirement | Status | Evidence |
| --- | --- | --- |
| GP-001 | Pass | `gatheringCooldown.test.ts` and the four-player Local browser vector count only accepted normal end-turn transitions; setup does not consume cooldown. |
| GP-002 | Pass | Domain restart vectors and browser values prove `2n`: Local four-player `8`, Online three-player `6`. |
| GP-003 | Pass | Shared blocker tests and isolated Online caller projections allow only the current active player. |
| GP-004 | Pass | Domain blocker priority and Local/Online browser assertions require a clean post-roll action phase. |
| GP-005 | Pass | Domain atomic rejection and browser ready-boundary assertions require idle phase and zero cooldown. |
| GP-006 | Pass | Three/four-player domain vectors prove the post-start target is `t+n+1`. |
| GP-007 | Pass | Domain, Local, and Online vectors retain `n` across the initiating end turn. |
| GP-008 | Pass | Local `4→0` and Online `3→0` subsequent-turn browser vectors decrement exactly once and clamp at zero. |
| GP-009 | Pass | Domain start replacement and identical Online public projections prove one table window. |
| GP-010 | Pass | Pure domain helpers use authoritative game turn/player count; repository guards reject client timer ownership. |
| GP-011 | Pass | Automatic gathering code/metadata/log paths were deleted and guarded. |
| GP-012 | Pass | Domain complete-to-idle tests and zero-token browser paths retain completion until accepted end turn. |
| GP-013 | Pass | Fresh/same-map restart domain and browser tests reset the cooldown baseline. |
| GP-014 | Pass | Shared stable blockers and rejected Local/Worker state-equality tests prove atomic failure. |
| GP-015 | Pass | Domain commands carry trusted actor identity; public protocol/browser intent remains exact no-payload. |
| GP-016 | Pass | Worker authority tests and real isolated callers prove authenticated-seat actor derivation. |
| GP-017 | Pass | Public projection exposes one remaining value while allowed actions remain caller-specific. |
| GP-018 | Pass | Schema-v3 room tests persist target/cap and reconstruct equal values after reconnect/eviction. |
| GP-019 | Pass | Protocol-v3 exact parsing plus adversarial browser WebSocket rejection cover incompatible input. |
| GP-020 | Pass | Worker migration tests preserve a v2 lobby without fabricating a match. |
| GP-021 | Pass | Worker migration vectors assign `2n` to v2 idle/complete matches. |
| GP-022 | Pass | Worker migration vectors preserve redemption/auction data and assign post-gathering `n`. |
| GP-023 | Pass | Migration tests remove obsolete metadata and prove invalid raw storage remains unchanged with no snapshot. |
| GP-024 | Pass | Worker authority tests retain serialized idempotency/version/persist-before-broadcast/recipient projection behavior. |
| GP-025 | Pass | Domain and Local browser setup vectors prove first settlements grant nothing. |
| GP-026 | Pass | Domain and seeded Local browser vectors grant every adjacent producing resource on second settlement. |
| GP-027 | Pass | Focused repeated-resource/desert vectors count hexes independently and ignore desert. |
| GP-028 | Pass | Domain and browser evidence prove equal bank debit in the same settlement transition. |
| GP-029 | Pass | Domain and browser paired-road assertions prove exact-once behavior. |
| GP-030 | Pass | Insufficient-bank domain test proves byte-equivalent atomic rejection. |
| GP-031 | Pass | Local and Online use the same pure setup settlement transition; no adapter award path exists. |
| GP-032 | Pass | `ResourceBadge.tsx` owns the only five-resource Lucide mapping. |
| GP-033 | Pass | Resource presentation suites and browser inventory/control checks cover named operational/state surfaces. |
| GP-034 | Pass | Statistics tests and bilingual accessible bundle labels preserve independent semantics. |
| GP-035 | Pass | Browser asserts four generic ratio-only and five icon-plus-ratio resource ports. |
| GP-036 | Pass | Browser asserts 18 producing hex icons with retained dice visuals and no visible terrain label nodes. |
| GP-037 | Pass | Browser asserts one desert without a produced-resource icon and retains robber visuals. |
| GP-038 | Pass | Component and bilingual browser assertions prove complete localized accessible names/tooltips; icon-only maritime and development resource buttons place the same complete label in `aria-label` and parent `title`. |
| GP-039 | Pass | Five distinct Lucide identities and five filled semantic badge colors avoid color-only meaning. |
| GP-040 | Pass | Localization/log tests retain full resource names in rules, help, and natural-language logs. |
| GP-041 | Pass | Dependency and repository guards prove no package, remote asset, font, or duplicate icon mapping. |
| GP-042 | Pass | Local and Online browser views contain exactly one compact cooldown badge while idle. |
| GP-043 | Pass | Component and Local zero-boundary browser checks require ready text/class as well as color. |
| GP-044 | Pass | Domain priority tests and browser `aria-describedby` checks expose the highest-priority disabled reason. |
| GP-045 | Pass | Localization/component/browser evidence covers English and Simplified Chinese resource/cooldown semantics, including English singular/plural forms for counts `0`/`1`/`2` across cooldowns, resource cards, roads, token transfers, and auctions with unchanged Chinese counters. |
| GP-046 | Pass | Focused domain/main/Worker/UI and three/four-player browser evidence spans all named behavior. |
| GP-047 | Pass | English desktop, Chinese mobile, four-player Local, and three isolated Online callers pass targeted Playwright checks. |
| GP-048 | Pass | All named release commands, repository guards, final diff check, task reviews, and the whole-branch independent review pass. |

## Browser Findings

The first current Playwright run failed on obsolete `.resource-token` selectors after the intentional icon migration. Additional RED runs found stale native maritime-select assumptions, cost buttons whose accessible names now include semantic icon bundles, terrain-name parsing that no longer matched icon-only board markup, the renamed first Local player, and pre-cooldown gathering assumptions. Those were corrected in test helpers.

The recovered browser paths reproduced two in-scope production defects. Maritime resource-choice buttons overrode the global touch target with a 38 px minimum; the three viewport tests failed with ten short buttons until the scoped rule returned to 44 px. The Online public log projected `.slice(-6)` even though domain logs are newest-first, so a newly completed no-bid auction disappeared behind old dice entries. A focused unit RED received entries 15 through 19 plus the welcome entry instead of entries 0 through 5; changing the projection to `.slice(0, 6)` made that unit and the real Worker no-token auction browser vector GREEN.

Whole-branch review then confirmed two presentation gaps. English cooldown and generic resource-card text used literal parenthetical plurals, and icon-only maritime/development resource controls exposed complete accessible names but no matching hover tooltip on the interactive element. RED tests covered counts `0`/`1`/`2`, retained Chinese semantics, and both locales across every affected button. Count-aware `one`/`other` messages and a single per-button localized label reused for `aria-label` and `title` resolved both findings without a new dependency or presentation abstraction.

Re-review expanded the no-parenthetical-plural condition to six remaining production occurrences: Road Building counts, Commerce and keyed-log auction results, keyed token-transfer logs, and the two raw domain fallback summaries. A four-file RED run produced six failures. Existing base log keys remain the stable plural protocol forms, internal `.one` templates are selected only at UI/log formatting boundaries from trusted numeric params, and raw fallbacks select the word directly. The same command passed 59/59, Chinese output remained unchanged, and the repository guard reports zero parenthetical-plural markers in `src` and `test`.

Strict invalid `START_GATHERING` payloads close every socket for the authenticated seat through the existing protocol-incompatible path. The adversarial browser assertion therefore captures the third caller's lifecycle, complete public gameplay state, complete private state, and complete allowed actions before sending actor/timer fields; verifies the observed room version remains exactly unchanged before reconnect; then reconnects, waits for all callers to converge, and compares that full gameplay projection exactly. Only the top-level acknowledgement, top-level and embedded room version, and separate socket presence/connection lifecycle are excluded. A reconnect may observe a newer room version due to connection lifecycle activity, but it cannot mutate gameplay.

## Repository Guard Results

- Automatic gathering trigger/log matches: `0`.
- Obsolete `lastAutoGatheringRound` production owners: `0`; its sole remaining file is the compatibility-only v2-to-v3 migration.
- Personal or player-keyed cooldown matches: `0`.
- Legacy resource/terrain abbreviation nodes: `0`.
- Resource icon mapping owners: exactly `1`, `src/ui/ResourceBadge.tsx`.
- Visible terrain-text references in `GameTable.tsx`: `0`; the single terrain translation reference supplies the accessible hex label.

## Artifact Convergence

The final specification, plan, and task list agree on one authoritative table cooldown, the second-settlement grant, protocol/storage v3, one shared icon mapping, bilingual semantics, and the complete release command set. Artifact convergence corrected the T007 browser wording to match the supported product boundary: Local remains fixed four-player hot-seat play, while a real three-player Online room supplies the three-player browser vector required by GP-046/GP-047 without a test-only roster. No requirement gap or newly discovered implementation task remains, so no task was appended or renumbered. The whole-branch reviewer returned `Ready to merge: Yes`; T007 and GP-048 are complete.
