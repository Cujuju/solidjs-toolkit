import { describe, expect, it } from 'vitest';
import { renderToString } from 'solid-js/web';
import { GlassMenu } from '../index.js';

describe('server render', () => {
  it('renders', () => {
    expect(renderToString(() => <GlassMenu>body</GlassMenu>)).toContain('body');
  });
});
