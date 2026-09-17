# defect-register implementation — handoff

**Status**: SHIPPED+PUSHED (48 commits, `94e70f9..968ba91`)

**Tip**: `968ba91` fix(kv-tooltip): keep the panel while focus moves into it; filterEntries lives with TooltipContent

## What changed
- All 153 confirmed register defects worked through 19 packages: each re-verified from source, fixed at the root cause, pinned by a failing-first test. 2–3 adversarial Opus reviews per package drove 1–5 fix rounds each (reviews caught real regressions in every package). Suite now 1362 tests / 19 projects, `pnpm -r test` exit 0.
- Three cross-package contracts extracted: hooks `createEscapeOwner` (one globalThis Escape stack + owned-node delegation; anchored-popover, both pill pickers, chip-flyout, kv-tooltip migrated), CSS packaging (`sideEffects` + `./style.css` in all 16 CSS packages, `_shared/injectCssImport`, playground contract test), shared `_shared/vitest.base.config.ts` (18 configs; fixes the dual-Solid-instance `cleanup()` bug).
- Comment scrub to the 30-word cap repo-wide; accordion-dock's 118 records that were ≥100 words moved verbatim to `packages/accordion-dock/DESIGN_NOTES.md`, keyed by HEAD file:line with pointers at each site.
- Split batch 1: AccordionGroup 1332→995, KvTooltip 760→441, PillNumberPicker 1123→773, PillDatePicker 774→645 (+RailButton, TooltipContent, KvTooltipPanel, 2× types.ts, autoRepeat).
- The split's bug hunt found 4 more real defects (auto-repeat timer never dies after a refused tick; wheel listener lost when `collapsible` flips; rail reorder counts unrendered ids; kv-tooltip hid the panel when focus entered it) — all fixed.

## Pending
- **F005, user call**: accordion-dock devDeps `@cujuju/solid-reorder-list >=0.3.0-rc.4`, which is UNPUBLISHED (npm 404) — no npm consumer can install the package. Publish rc.4, or switch to `github:Cujuju/solid-reorder-list#v0.3.0-rc.4` and re-lock.
- **GitHub Issues, user call**: the register was never filed (public repo + then-unpatched packages). Fixes are now pushed, so that objection is gone.
- **Splits stopped after batch 1** on the 7-day usage budget (88%). 51 files still >300 lines: 16 source, 5 CSS, 6 playground pages, ~28 tests.
- Follow-ups recorded in the reports, none blocking: `persistence.ts` extraction (cut from the batch-1 plan), `toCssSize` deduped into hooks (5 identical copies), the 60–99-word DESIGN_NOTES tier, 4 pre-existing tsc errors (hooks TS2554, glass-menu jest-dom types, glass `@types/node`), jsdom `@layer` parse warnings (36, harmless).

## Resume path
1. `git log --oneline 94e70f9..968ba91` is this session. Every agent report is in `.audit/reports/` (~40 files) and the running board in `.audit/HANDOFF.md`; the register itself is `.audit/inventory_final.json`. **`.audit/` is git-excluded (`.git/info/exclude`) — local only, never pushed.**
2. Verify before touching anything: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm -r --workspace-concurrency=1 test` → 19 projects, 1362 tests, exit 0. The PATH `pnpm` on this box is a Windows binary; under WSL always go through `corepack`.
3. To continue splitting: `Workflow({scriptPath: '<session>/workflows/scripts/shrink-large-files-wf_ea8ed754-387.js', resumeFromRunId: 'wf_ea8ed754-387', args: {applyMode: 'apply', files: [...]}})` — `args` MUST be a JSON object; a string is silently ignored and the run replays from cache. Batch 1 cost ~2.3M subagent tokens for 4 files.
4. Then F005 and the Issues call above.

## Cross-refs
- Prior session (audit only, 153 findings + 47 refuted): `E:/Development/.claude-memory/project_session_handoff_2026_09_08_solidjs-toolkit-defect-register.md`
- Register as a filterable page: https://claude.ai/code/artifact/859ebc96-bbc3-47e4-b5d5-298502a81a45
