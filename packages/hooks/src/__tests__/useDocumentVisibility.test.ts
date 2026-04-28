import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
import { useDocumentVisibility } from '../useDocumentVisibility';

describe('useDocumentVisibility', () => {
  it('returns current visibility state', () => {
    createRoot(() => {
      const state = useDocumentVisibility();
      expect(['visible', 'hidden']).toContain(state());
    });
  });
});
