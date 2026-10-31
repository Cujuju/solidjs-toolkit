import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { HoldIndicator } from '../index';

describe('server render', () => {
  it.each(['circle', 'rect', 'bar'] as const)('renders shape=%s', (shape) => {
    expect(typeof renderToString(() => <HoldIndicator progress={0.5} shape={shape} />)).toBe('string');
  });
});
