import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { NoticeOverlay } from '../renderer/index.js';
import type { NoticeBridge } from '../types.js';

const bridge: NoticeBridge = {
  onNotice: () => () => undefined,
  onView: () => () => undefined,
  onWithdraw: () => () => undefined,
  resize: () => undefined,
  pointer: () => undefined,
  ack: () => undefined,
  open: () => undefined,
  action: () => undefined,
  pin: () => undefined,
  closed: () => undefined,
  ready: () => undefined,
};

describe('server render', () => {
  it('renders NoticeOverlay with no notices', () => {
    expect(renderToString(() => <NoticeOverlay bridge={bridge} />)).toContain('cuj-notices');
  });
  it('renders NoticeOverlay inline', () => {
    expect(renderToString(() => <NoticeOverlay bridge={bridge} inline />)).toContain('data-inline');
  });
});
