import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { KvTooltip, KvTooltipPanel } from '../index';

describe('server render', () => {
  it('renders the trigger and a positioned panel', () => {
    expect(renderToString(() => <KvTooltip entries={{ Bid: '1.00' }}>trigger</KvTooltip>)).toContain('trigger');
    expect(typeof renderToString(() => <KvTooltipPanel entries={{ Bid: '1.00' }} x={10} y={10} />)).toBe('string');
  });
});
