import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { ChipFlyout } from '../index';

const OPTIONS = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];

describe('server render', () => {
  it.each([false, true])('renders with open=%s', (open) => {
    const html = renderToString(() => (
      <ChipFlyout mode="multi" label="Letters" options={OPTIONS} value={['a']} onChange={() => {}} open={open} onOpenChange={() => {}} />
    ));
    expect(html).toContain('Letters');
  });
});
