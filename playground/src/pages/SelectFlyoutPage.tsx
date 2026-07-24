import { createSignal, type JSX } from 'solid-js';
import { Flyout, type FlyoutOption } from '@cujuju/solidjs-select-flyout';
import {
  Card,
  ClipBox,
  EdgeRight,
  EventLog,
  ScrollBox,
  createEventLog,
} from '../ui';

const TIMEFRAMES: FlyoutOption[] = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '1w', label: '1 week (history only)', disabled: true },
];

/** Long enough to exceed the panel's 320px max-height, so the option list scrolls internally —
 *  the case that must NOT be confused with an outside scroll. */
const MANY: FlyoutOption[] = Array.from({ length: 40 }, (_, i) => ({
  value: `k${i}`,
  label: `Strike ${6000 + i * 25}`,
}));

const LONG: FlyoutOption[] = [
  { value: 'a', label: 'A perfectly ordinary option' },
  {
    value: 'b',
    label:
      'An option whose label is far longer than any sane trigger width and therefore has to either wrap, truncate, or blow the control out sideways',
  },
];

export function SelectFlyoutPage(): JSX.Element {
  const log = createEventLog();
  const [tf, setTf] = createSignal('5m');
  const [tf2, setTf2] = createSignal('1h');
  const [strike, setStrike] = createSignal('k12');
  const [long, setLong] = createSignal('a');

  const pick = (set: (v: string) => void, tag: string) => (v: string) => {
    set(v);
    log.log('onChange', { who: tag, value: v });
  };

  return (
    <>
      <h1>@cujuju/solidjs-select-flyout</h1>
      <p class="note">
        A select that opens a <code>.glass-menu</code> panel instead of a native dropdown, so it
        can be themed and so a disabled option can say why. Positioning and dismiss come entirely
        from <code>@cujuju/solidjs-anchored-popover</code> — <b>which means its scroll bug is this
        package's scroll bug</b>.
      </p>

      <h2>1 · Variants</h2>
      <div class="row">
        <Card cap="options, one disabled">
          <Flyout options={TIMEFRAMES} value={tf()} onChange={pick(setTf, 'timeframe')} ariaLabel="Timeframe" />
          <span class="readout">value <b>{tf()}</b></span>
        </Card>
        <Card cap="disabled trigger · empty options · placeholder">
          <Flyout options={TIMEFRAMES} value={tf()} onChange={() => {}} disabled />
          <Flyout options={[]} value="" onChange={() => {}} placeholder="No options" />
          <Flyout options={TIMEFRAMES} value="" onChange={pick(setTf, 'placeholder')} placeholder="Pick one…" />
        </Card>
        <Card cap="40 options — the panel scrolls internally (max-height 320px)">
          <Flyout options={MANY} value={strike()} onChange={pick(setStrike, 'strike')} ariaLabel="Strike" />
          <span class="readout">value <b>{strike()}</b></span>
        </Card>
        <Card cap="a label longer than the control">
          <Flyout options={LONG} value={long()} onChange={pick(setLong, 'long')} ariaLabel="Long label" />
        </Card>
      </div>

      <h2>2 · Hostile ancestors</h2>
      <div class="row">
        <Card cap="overflow: hidden — escapes (top layer)">
          <ClipBox width="150px">
            <Flyout options={TIMEFRAMES} value={tf2()} onChange={pick(setTf2, 'clip')} />
          </ClipBox>
        </Card>
        <Card cap="⚠ overflow-y: auto — open it, THEN SCROLL. It does not follow.">
          <ScrollBox width="220px" height="160px">
            <div style={{ padding: '10px' }}>
              <Flyout options={TIMEFRAMES} value={tf2()} onChange={pick(setTf2, 'scrollbox')} />
            </div>
          </ScrollBox>
        </Card>
        <Card cap="right viewport edge — clamps" wide>
          <EdgeRight>
            <Flyout options={MANY} value={strike()} onChange={pick(setStrike, 'edge')} />
          </EdgeRight>
        </Card>
      </div>
      <p class="note">
        <b>BUG (inherited).</b> Open the select in the scroll box and scroll the box: the panel is
        left behind, floating in place while the trigger walks off. That is not a bug in this
        file — <code>Flyout</code> hands positioning to <code>AnchoredPopover</code>, which
        registers <code>resize</code> and nothing else. Fixing it there fixes it here and in{' '}
        <code>editable-list-flyout</code> at the same time. Note the SECOND scroll case that must
        keep working: the 40-option panel scrolls <i>internally</i> without dismissing, so
        whatever fix lands must distinguish an inside scroll from an outside one (as{' '}
        <code>createOutsideScrollDismiss</code> already does).
      </p>

      <h2>3 · State &amp; dismiss</h2>
      <p class="note">
        <b>No controlled open state.</b> <code>FlyoutProps</code> is{' '}
        <code>options / value / onChange / placeholder / disabled / ariaLabel / class / id</code>{' '}
        — there is no <code>open</code> or <code>onOpenChange</code>, so a caller cannot open this
        panel programmatically or observe that it opened. That is a genuine API gap, not something
        I could demonstrate around; the <code>chip-flyout</code> sibling exposes both. Exit paths
        it DOES have: <b>Escape</b>, <b>outside pointerdown</b> (both from{' '}
        <code>AnchoredPopover.onDismiss</code>), <b>select an option</b>, and the <b>trigger</b>{' '}
        (toggles). No scroll-away, per above. Only <code>onChange</code> is observable, so that is
        all the log can show.
      </p>
      <div class="row">
        <Card cap="every exit path — only one of them is observable">
          <Flyout options={TIMEFRAMES} value={tf()} onChange={pick(setTf, 'dismiss')} ariaLabel="Dismiss" />
          <span class="readout">
            Escape / outside-click / re-click the trigger: all close the panel, none emit anything.
          </span>
        </Card>
      </div>

      <h2>4 · Event log</h2>
      <div class="row">
        <EventLog
          log={log}
          hint="Only onChange exists. Opening, dismissing and scrolling are all invisible to a caller — that is the API gap."
        />
      </div>
    </>
  );
}
