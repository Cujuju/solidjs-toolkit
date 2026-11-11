import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { ContextMenu, ContextMenuSubmenuTrigger, type ContextMenuEntry } from '../index.js';
import { MenuEntries } from '../MenuEntries.js';

const ITEMS: ContextMenuEntry[] = [
  { label: 'Rename', onClick: () => {} },
  { label: 'More', submenu: true, children: [{ label: 'Delete', onClick: () => {} }] },
];

describe('server render', () => {
  it('renders an open menu', () => {
    expect(typeof renderToString(() => <ContextMenu items={ITEMS} x={10} y={10} onClose={() => {}} />)).toBe('string');
  });

  it('renders a closed custom trigger without mounting its flyout', () => {
    // ContextMenu's root Portal emits no content on the server. Render its body directly.
    const html = renderToString(() => (
      <MenuEntries
        items={[{ custom: () => (
          <ContextMenuSubmenuTrigger submenu={{ submenu: true, label: 'More', children: ITEMS }}>
            More actions
          </ContextMenuSubmenuTrigger>
        ) }]}
        onClose={() => {}}
        parentMenuRef={() => null}
      />
    ));
    expect(html).toContain('More actions');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Rename');
  });
});
