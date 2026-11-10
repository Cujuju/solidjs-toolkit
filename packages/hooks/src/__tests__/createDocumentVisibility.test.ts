import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
import { createDocumentVisibility } from '../createDocumentVisibility.js';

describe('createDocumentVisibility', () => {
  it('returns current visibility state', () => {
    createRoot(() => {
      const state = createDocumentVisibility();
      expect(['visible', 'hidden']).toContain(state());
    });
  });
});
