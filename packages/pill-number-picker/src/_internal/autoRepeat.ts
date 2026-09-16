import { createEffect, onCleanup, type Accessor } from 'solid-js';

export function createAutoRepeat(options: {
  step: (dir: 1 | -1) => boolean;
  disabled: Accessor<boolean>;
  delay: Accessor<number>;
  interval: Accessor<number>;
  acceleration: Accessor<boolean>;
}): {
  start: (direction: 1 | -1) => void;
  stop: () => void;
  onClick: (dir: 1 | -1) => (e: MouseEvent) => void;
} {
  const {
    step: stepBy,
    disabled,
    delay: autoRepeatDelay,
    interval: autoRepeatInterval,
    acceleration: autoRepeatAcceleration,
  } = options;

  let repeatTimer: ReturnType<typeof setTimeout> | undefined;
  let repeatInterval: ReturnType<typeof setTimeout> | undefined;
  let holdStart: number | null = null;
  /** A hold that reached the repeat threshold already stepped; the `click` that the
   *  release dispatches afterwards must not add one more on top of it. */
  let repeated = false;

  const stopRepeat = (): void => {
    if (repeatTimer !== undefined) { clearTimeout(repeatTimer); repeatTimer = undefined; }
    if (repeatInterval !== undefined) { clearTimeout(repeatInterval); repeatInterval = undefined; }
    holdStart = null;
  };

  const startRepeat = (direction: 1 | -1): void => {
    stopRepeat();
    repeated = false;
    if (disabled()) return;
    holdStart = Date.now();

    /** Whether the tick stepped; a refused tick has already stopped the hold. */
    const doStep = (): boolean => {
      // Re-checked every tick, not once at press time: a disabled <button> is inert, so
      // the pointerup that would have stopped the hold is never dispatched to it.
      if (disabled()) { stopRepeat(); return false; }
      if (!stepBy(direction)) { stopRepeat(); return false; }
      repeated = true;
      return true;
    };

    repeatTimer = setTimeout(() => {
      const scheduleNext = (): void => {
        if (!doStep()) return;
        let interval = autoRepeatInterval();
        if (autoRepeatAcceleration() && holdStart !== null) {
          const heldMs = Date.now() - holdStart;
          // Halve interval every 1.5s held; floor at 15ms.
          const factor = Math.pow(0.5, Math.floor(heldMs / 1500));
          interval = Math.max(15, Math.floor(autoRepeatInterval() * factor));
        }
        repeatInterval = setTimeout(scheduleNext, interval);
      };
      scheduleNext();
    }, autoRepeatDelay());
  };

  /** Only a POINTER click (detail > 0) can release a hold; a keyboard click always steps,
   *  so a stale flag never swallows one. */
  const onStepperClick = (dir: 1 | -1) => (e: MouseEvent): void => {
    if (disabled()) return;
    const releasesHold = repeated && e.detail > 0;
    repeated = false;
    if (releasesHold) return;
    stepBy(dir);
  };

  // Belt-and-suspenders for the same hole: whichever release event goes missing, a hold
  // cannot outlive the enabled state.
  createEffect(() => {
    if (disabled()) stopRepeat();
  });

  onCleanup(stopRepeat);

  return { start: startRepeat, stop: stopRepeat, onClick: onStepperClick };
}
