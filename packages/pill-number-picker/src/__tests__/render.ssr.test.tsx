import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { PillNumberPicker } from '../index';

describe('server render', () => {
  it('renders', () => {
    expect(renderToString(() => <PillNumberPicker value={5} onChange={() => {}} />)).toContain('5');
  });
});
