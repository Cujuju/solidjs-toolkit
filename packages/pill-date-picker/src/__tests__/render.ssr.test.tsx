import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { PillDatePicker } from '../index';

describe('server render', () => {
  it('renders', () => {
    const html = renderToString(() => (
      <PillDatePicker items={['2026-11-20', '2026-12-18']} value="2026-11-20" onChange={() => {}} />
    ));
    expect(typeof html).toBe('string');
  });
});
