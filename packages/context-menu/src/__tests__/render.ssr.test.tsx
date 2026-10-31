import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { ContextMenu, type ContextMenuEntry } from '../index';

const ITEMS: ContextMenuEntry[] = [
  { label: 'Rename', onClick: () => {} },
  { label: 'More', submenu: true, children: [{ label: 'Delete', onClick: () => {} }] },
];

describe('server render', () => {
  it('renders an open menu', () => {
    expect(typeof renderToString(() => <ContextMenu items={ITEMS} x={10} y={10} onClose={() => {}} />)).toBe('string');
  });
});
