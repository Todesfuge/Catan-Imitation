# Seeded Random Maps Handoff

Status: Integrated and deployed; approved evidence-substitution verification complete

## Branch and Review Range

- Branch: `codex/seeded-random-maps`
- Merge base with `main`: `7eef0d4aa718b1b17ca5f2e6f89cf43ed850cc93`
- Browser convergence commit: `dd29d0d8fc197e4e18b2337b402e54c522c8cf01`
- Review convergence commit: `0d8f2b5b30eb202d7f187d31a2a652d6d7209e6f`
- Online UI synchronization commit: `1153edad8d588451a5258e897a3011ae3feaa459`
- Deterministic maritime coverage commit: `67b5e9dca6bbffe5eca46f507d82195c8dcc0492`
- Reviewed range: `7eef0d4..HEAD`, including the final documentation/release delta.
- The reviewed chain was fast-forwarded into `main`, pushed to `origin/main` at `a81a3fa`, and deployed as the combined Worker/SPA production release. No preview deployment was performed.

The feature commit chain is organized by boundary: specification/planning, seed codec, bounded board generator, match setup/restart, Local real setup, protocol/projection v2, storage migration, host authority/restart hardening, Settings UI, browser convergence, then release documentation.

## Delivered Behavior

- New Local and Online matches use a bounded deterministic randomized standard map identified by canonical `M1-[0-9A-F]{16}`.
- The public seed is sufficient to rebuild the complete public board in the browser; content-neutral M1 geometry keeps IDs stable across layout content.
- Local starts as an authentic empty four-player snake-order setup. Prepared scenarios remain test-only.
- Settings shows a selectable seed and bilingual copy status. Clipboard denial retains manual selection.
- Same-map restart preserves seed/layout; fresh restart replaces both. Each atomically clears gameplay, private hands, pieces, pending choices/trades, and Commerce Guild state.
- Online restart is host-only, explicitly confirmed, versioned once, persisted before broadcast, idempotent, rate-limited, and reconnect-safe.

## Migration Contract

- A valid v1 lobby migrates to storage schema v2 without a match seed; its eventual start creates a new M1 map.
- A v1 playing or finished room migrates only if the complete stored board exactly matches the released fixed board. It receives reserved `M0-STANDARD` without resetting phase, pieces, hands, pending state, room version, credentials, or live references.
- `M0-STANDARD` is readable/replayable for compatibility but is never returned by fresh seed generation.
- A changed, unknown, malformed, or unsupported board/seed is rejected through the incompatible/internal safety path. Validation completes before replacement storage or broadcast, so failure produces no partial write.

## Deployment Implications

- Deploy the Worker and SPA together because room storage schema v2 and wire protocol v2 are a single compatibility boundary. Old incompatible clients must refresh through the existing recovery path.
- Production target: `https://catan-imitation.catan-imitation.workers.dev/`, as reported by Wrangler and the prior Online release records. The shorter account-subdomain address was corrected as documentation drift.
- `pnpm exec wrangler deploy --dry-run --config wrangler.jsonc` passed with 4 assets, a 228.75 KiB upload / 47.57 KiB gzip bundle, and the `ROOMS` Durable Object and `ASSETS` bindings.
- `pnpm exec wrangler deploy --config wrangler.jsonc` then deployed the Worker and SPA together. Cloudflare reports Version ID `75810c45-9ec5-47e3-82b6-fece224462ce` at 100% of production traffic with the expected bindings.
- Preview deployment remains `pnpm exec wrangler deploy --name catan-imitation-preview`; do not use a version preview URL for this Durable Object binding.
- The desktop's poisoned workers.dev DNS prevented direct production-host probes. Under the approved evidence-substitution path, Cloudflare control-plane activation and the exact-commit health, rendered-SPA, room create/join, host restart, participant denial, and reconnect gates serve as the release evidence; they are not labeled as direct live-host requests.
- For recovery, switch traffic only to a previously verified schema-v2-compatible Worker deployment. After any room has migrated to schema v2, never roll back to a schema-v1 binary; use a compatible v2 deployment or roll forward with a corrective release.

## Verification Summary

- Domain/client: 34 files, 437 tests passed.
- Worker: 7 files, 247 tests passed.
- Browser: 2 projects, 50 tests passed (47 Local/preview and 3 real Worker).
- Deterministic maritime evidence: the pre-cleanup helper passed 27/27 across three canonical M1 seeds, three build targets, and three repetitions; the mechanically simplified final committed helper passed 9/9 alone and again inside the 50/50 browser suite.
- Builds, UI smoke, Worker smoke, repository guards, whitespace check, and Wrangler dry-run passed.
- Cloudflare activated production Version ID `75810c45-9ec5-47e3-82b6-fece224462ce` for 100% of traffic with `ROOMS` and `ASSETS`; direct production-host requests remain evidence-substituted because of the documented local DNS fault.
- Visual review covered Local/Online, desktop/mobile, and English/Chinese restart confirmation with 0 P0/P1 findings.
- Full requirement evidence, the T009 integration defects, and the resolved review findings are recorded in [verification.md](verification.md).

## Known Out-of-Scope Work

- User accounts, public matchmaking, and cross-device seat recovery.
- Long-term saved games and a user-facing resumed-room lifecycle.
- AI players.
- Non-standard board sizes/topologies and arbitrary custom map editors.
- Exact proprietary artwork or rules text.

The Worker test runner may emit Windows `EBUSY` warnings while deleting Miniflare temporary directories after all 247 tests pass; the command exits 0 and no repository files are affected.

## Exact Next Action

No release action remains. An operator on an unaffected network may optionally perform a direct live-host confirmation at `https://catan-imitation.catan-imitation.workers.dev/`; any corrective release or recovery must remain schema-v2-compatible and should roll forward unless a previously verified v2 deployment is selected.
