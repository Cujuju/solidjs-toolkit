/// <reference types="vite/client" />

/**
 * Vite resolves a `.css` import to a side effect, not a value; without this `tsc --noEmit` fails
 * on every stylesheet import in main.tsx.
 */
declare module '*.css';
