# solidjs-toolkit

pnpm monorepo of `@cujuju/solidjs-*` SolidJS UI primitives. 18 published packages under
`packages/*`, a demo app in `playground/`, shared build/test config in `packages/_shared`
(build-time only — not a workspace package). Per-package conventions:
`packages/_shared/CONTRIBUTING.md`.

## Task tracking

GitHub Issues on `Cujuju/solidjs-toolkit` (public).

- **Buckets** (`area/<x>`, one per issue): `area/build`, `area/test`, `area/docs`,
  `area/repo-health`.
- **Arcs** (`arc/<slug>`, on every issue in one work-thread, kept forever):
  `arc/defect-register-implementation` is the 2026-09 register arc.
- **Other axes**: `kind/bug`, `kind/refactor`, `kind/chore`; priority `p1`–`p4`.
- Active: `gh issue list --repo Cujuju/solidjs-toolkit --state open`.
  On fire: `--label p1 --label p2`. Per arc: `--label arc/<slug> --state all`.

## Toolchain

- **WSL sessions**: the `pnpm` on PATH is a Windows binary and fails on `/mnt/e`. Always
  `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm …` (Linux node).
- **Never run two vitest processes against the same package** — the shared Vite transform
  cache yields reproducible phantom failures. `pnpm -r test` needs
  `--workspace-concurrency=1` for a trustworthy count (19 projects, 1362 tests).
- **Build before typechecking a fresh checkout**: every package's `types` export points at
  `dist/`, so `pnpm -r build` must precede `tsc` in any dependent.
- Test config is one shared base: `packages/_shared/vitest.base.config.ts` (`libTest(dir,
  overrides?)`). It inlines `solid-js` **and** `@solidjs/testing-library` — without the
  latter, Node ESM loads a second Solid instance and `cleanup()` silently disposes nothing.

## Design records

Comments are capped at 30 words (global rule). Where that cost a real record — an incident,
a measured probe, a rejected alternative — the original text lives in
`packages/accordion-dock/DESIGN_NOTES.md`, keyed by `file:line`, with a pointer at the site.
