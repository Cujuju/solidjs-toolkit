import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { TriStateChip } from '../index';

describe('server render', () => {
  it.each(['unselected', 'included', 'excluded'] as const)('renders %s', (value) => {
    expect(renderToString(() => <TriStateChip label="Tech" value={value} onCycle={() => {}} />)).toContain('Tech');
  });
});
