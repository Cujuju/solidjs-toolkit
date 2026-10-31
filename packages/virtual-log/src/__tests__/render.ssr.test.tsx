import { describe, expect, it } from 'vitest';
import { createSignal } from 'solid-js';
import { renderToString } from 'solid-js/web';
import { createVirtualLog, VirtualLog } from '../index';

describe('server render', () => {
  it('renders', () => {
    const html = renderToString(() => {
      const [rows] = createSignal([{ key: 'a' }, { key: 'b' }]);
      const log = createVirtualLog({ rows, estimateSize: 20 });
      return <VirtualLog log={log}>{(row) => <span>{row().key}</span>}</VirtualLog>;
    });
    expect(typeof html).toBe('string');
  });
});
