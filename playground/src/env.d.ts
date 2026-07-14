/**
 * Vite resolves a `.css` import to a side effect, not a value. Without this, `tsc --noEmit`
 * fails on every stylesheet import in main.tsx even though the build is fine — and a
 * typecheck that cannot be run is a typecheck that never runs.
 */
declare module '*.css';
