import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { NoticeOverlay } from '../renderer';
import type { NoticeBridge } from '../types';

const bridge: NoticeBridge = {
  onNotice: () => () => undefined,
  onView: () => () => undefined,
  resize: () => undefined,
  pointer: () => undefined,
  open: () => undefined,
};

describe('server render', () => {
  it('renders NoticeOverlay with no notices', () => {
    expect(renderToString(() => <NoticeOverlay bridge={bridge} />)).toContain('cuj-notices');
  });
});
