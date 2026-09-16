import { libTest } from '../_shared/vitest.base.config';

export default libTest(__dirname, {
  test: {
    // happy-dom, not jsdom: focus-after-paint tests rely on its deterministic rAF / effect-flush
    // ordering after afterPaint and AnchoredPopover's measure.
    environment: 'happy-dom',
  },
});
