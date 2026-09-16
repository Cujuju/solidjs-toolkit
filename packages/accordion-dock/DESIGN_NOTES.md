# accordion-dock — design notes

Records moved out of source comments when the 30-word comment cap was applied.
Each section reproduces the HEAD text VERBATIM, exactly as it stood in commit
707f423, and is headed by the file and line it came from at HEAD.

Source comments carry the invariant plus `see DESIGN_NOTES.md § <file>:<line>`.
Boundary: every comment that was 100 words or more at HEAD.

Sections are grouped by file, in HEAD line order.


---

# src/__tests__/appearance.test.tsx


## § src/__tests__/appearance.test.tsx:7

*`appearance` — the CONTRACT, and honestly what of it can be tested here.*

HEAD `src/__tests__/appearance.test.tsx:7` — 137 words. Attached to: `function mount(options: {`

```text
/**
 * `appearance` — the CONTRACT, and honestly what of it can be tested here.
 *
 * WHAT THESE COVER: that the group publishes `data-appearance`, that it defaults
 * to `flush`, and — the part that actually matters — that switching to `cards`
 * changes NOTHING about behaviour. Appearance is chrome; if pin/close/collapse or
 * the flyout path differ between the two, the prop has exceeded its remit.
 *
 * WHAT THEY DO NOT COVER, deliberately and worth knowing: the card chrome itself.
 * Every cards rule lives in `styles.css`, and jsdom applies no stylesheet — a
 * `getComputedStyle` assertion here would read the initial value and pass whether
 * or not the rule exists, which is worse than no test because it would read as
 * coverage. The data attribute IS the contract the CSS keys off; that the CSS
 * keyed off it correctly is a visual check, and was done on screen.
 */
```


---

# src/__tests__/breadcrumbPath.test.ts


## § src/__tests__/breadcrumbPath.test.ts:150

*REPLACES a test that asserted `setOpen` was never called on a leaf.*

HEAD `src/__tests__/breadcrumbPath.test.ts:150` — 123 words. Attached to: `const { group, calls } = createStubGroup({`

```text
/*
     * REPLACES a test that asserted `setOpen` was never called on a leaf.
     *
     * That was the right assertion when a leaf's controlled-ness was enforced by
     * the CALLER: closing one through the group would have dropped it from the open
     * list while its own `<Show when={props.open}>` kept painting it — a visible
     * pane the group believed closed, with a broken flex order and an orphaned
     * splitter. So this file skipped leaves, and a comment explained why.
     *
     * `setOpen` on a leaf is now a REQUEST that routes to the leaf's own
     * `requestClose` (see `PanelMeta.requestClose`), so the desync is no longer
     * something a caller can cause and the skip is gone. What this test protects is
     * that removing it did not lose the `onTruncate` report the consumer needs.
     */
```


---

# src/__tests__/columnFlex.test.ts


## § src/__tests__/columnFlex.test.ts:4

*WHO ABSORBS THE GROUP'S LEFTOVER EXTENT.*

HEAD `src/__tests__/columnFlex.test.ts:4` — 109 words. Attached to: `/** Sizes are arbitrary but distinct, so a wrong branch shows up as a wrong number`

```text
/**
 * WHO ABSORBS THE GROUP'S LEFTOVER EXTENT.
 *
 * `fill` mode divides the group's whole extent, but an explicitly-sized member is
 * fixed — so unless something is allowed to grow, the group paints a dead strip and
 * the mode has stopped meaning what it says. These pin the three answers:
 *
 *   1. Nobody declared → the TRAILING member grows. This is the historical default
 *      and every existing consumer's layout depends on it being byte-identical.
 *   2. Someone declared → that member grows and trailing does NOT. The recipient is
 *      a content question only the consumer can answer, so it is declared, never
 *      inferred from a member's role.
 *   3. Several declared → they SHARE, each from its own basis.
 */
```


---

# src/__tests__/domContract.test.tsx


## § src/__tests__/domContract.test.tsx:9

*The CSS and the components must agree about NAMES.*

HEAD `src/__tests__/domContract.test.tsx:9` — 322 words. Attached to: `/*`

```text
/**
 * The CSS and the components must agree about NAMES.
 *
 * This is the single most expensive defect class in this control's history, and
 * it has the same shape every time: a stylesheet selects something no component
 * emits, so a correct rule is simply never applied. Nothing errors. There is no
 * console message, no failed build, no type error — a missing style has no
 * failure state, it just looks like a layout bug and gets diagnosed as one.
 *
 * Three shipped instances, all found by eye, none catchable by tsc:
 *
 *   - `autoHide.css` styled `.acc-panel[data-flyout='true']` to take a flying-out
 *     panel's column out of the layout, and `AccordionPanel` never set the
 *     attribute. The column kept its slot and painted its title bar over the
 *     flyout floating above it.
 *   - `rail.css` selected `[data-overflow-mode]` and the group emitted
 *     `data-overflow` — one word apart. Every overflow-strategy rule was inert, so
 *     the rail fell back to a scrollbar in a 40px strip, which is precisely what
 *     the overflow work existed to remove.
 *   - `autoHide.css` and `rail.css` were never IMPORTED at all. Both were correct
 *     and neither had ever reached a browser.
 *
 * WHAT THIS ASSERTS, AND WHY ONLY THIS DIRECTION
 *
 * Every `.acc-*` class and every `[data-*]` attribute a stylesheet SELECTS must
 * appear somewhere in the components. The reverse is deliberately not asserted:
 * emitting a name no CSS styles is legitimate and common — `data-no-drag` is a
 * behavioural marker, `data-panel-id` is a measurement hook, `acc-flyout-shell` is
 * documented as a marker with no rule of its own. Flagging those would produce a
 * test that is noisy in the safe direction and therefore gets suppressed.
 *
 * It is a text scan, not a parse. That is a real limitation and it is the reason
 * the check is scoped to name EXISTENCE rather than to selector correctness: it
 * cannot tell whether `[data-open='true']` is ever actually set to `'true'`. What
 * it can tell — and what all three defects above were — is that a name on one side
 * has no counterpart on the other.
 */
```


## § src/__tests__/domContract.test.tsx:75

*One dock exercising every element the derived pairs name.*

HEAD `src/__tests__/domContract.test.tsx:75` — 105 words. Attached to: `function renderFixture(): { querySelectorAll: (s: string) => NodeListOf<Element>; cleanup: () => void } {`

```text
/**
 * One dock exercising every element the derived pairs name.
 *
 * `horizontal` because that is the configuration with a rail and an overflow mode;
 * a badge because `.acc-badge` only exists when a panel declares one; a leaf and a
 * `<Breadcrumb>` because `.acc-breadcrumb-crumb[data-leaf]` is styled and neither
 * appears otherwise.
 *
 * `autoHide` is deliberately OFF. jsdom does not implement the `:popover-open`
 * pseudo-class, so rendering an open flyout throws inside the popover primitive.
 * That costs nothing here: `data-flyout` is emitted unconditionally as
 * `'true'`/`'false'`, so the pair under test is present in the docked state too,
 * and the flyout's own geometry is covered by the browser suite where a real
 * popover exists.
 */
```


## § src/__tests__/domContract.test.tsx:176

*The name scan above is necessary and not sufficient, and the gap is worth*

HEAD `src/__tests__/domContract.test.tsx:176` — 133 words. Attached to: `const CSS_COMPOUND_PAIRS: readonly (readonly [string, string])[] = (() => {`

```text
/**
 * The name scan above is necessary and not sufficient, and the gap is worth
 * stating exactly: it asks whether a name exists ANYWHERE in the components, not
 * whether it is on the element the CSS targets.
 *
 * That is precisely the shape of the `data-flyout` defect. The attribute was
 * emitted — by the rail BUTTON — while `autoHide.css` selected it on the
 * `.acc-panel`, so a text scan finds the name present and passes. Simulated
 * against this file: removing `data-flyout` from `AccordionPanel` leaves all four
 * name-scan assertions green.
 *
 * So this block closes it by rendering a dock and asking the question of the DOM.
 * The pairs are DERIVED from the stylesheets — every compound selector of the form
 * `.acc-thing[data-attr]` — rather than listed by hand, so a rule added tomorrow
 * is checked without anyone remembering to add it here.
 */
```


## § src/__tests__/domContract.test.tsx:331

*The cascade-layer split: TOKENS layered, COMPONENT RULES unlayered.*

HEAD `src/__tests__/domContract.test.tsx:331` — 139 words. Attached to: `describe('cascade layers', () => {`

```text
/**
 * The cascade-layer split: TOKENS layered, COMPONENT RULES unlayered.
 *
 * This is the one architectural rule in the stylesheets, and breaking it is
 * completely silent — an unlayered declaration beats a layered one OUTRIGHT, ahead
 * of specificity, so a component rule that moves into the layer does not become
 * weaker in some measurable way, it simply stops applying.
 *
 * It has already happened. `autoHide.css` was wrapped in `@layer cujuju-defaults`
 * to "match styles.css", on the strength of a header comment that said defaults
 * live in a layer without mentioning that only the TOKEN block does. Every rule in
 * the file lost, and the one that mattered —
 * `.acc-panel[data-flyout='true'] { display: none }` — meant a flying-out panel's
 * docked column was never removed from the layout, so it kept its slot and painted
 * its title bar over the flyout in front of it. Found by eye, in a screenshot.
 */
```


## § src/__tests__/domContract.test.tsx:370

*A rule counts as a COMPONENT rule by what it DECLARES, not by what it*

HEAD `src/__tests__/domContract.test.tsx:370` — 103 words. Attached to: `const offenders: string[] = [];`

```text
/*
     * A rule counts as a COMPONENT rule by what it DECLARES, not by what it
     * selects. That distinction is the whole test.
     *
     * The naive version — "any `.acc-*` selector inside a layer" — flags
     * `:is(.acc-group, .acc-flyout-host)[data-density='compact']`, which is a token
     * override: it selects a class because density is set as an attribute on the
     * group (and restated on the Portal'd flyout host, which escapes the group's
     * scope), and it declares nothing but `--acc-*`. That rule BELONGS in the layer
     * for the same reason `:root` does — a consumer overriding a density token
     * unlayered should win.
     *
     * So: a rule inside a layer may declare custom properties only.
     */
```


---

# src/__tests__/flyoutCrossAxis.test.ts


## § src/__tests__/flyoutCrossAxis.test.ts:4

*A FLYOUT MUST NEVER BE THE REASON ITS OWN CONTENT CLIPS.*

HEAD `src/__tests__/flyoutCrossAxis.test.ts:4` — 132 words. Attached to: `/** A deliberately narrow group — the sidebar case that produced the bug. */`

```text
/**
 * A FLYOUT MUST NEVER BE THE REASON ITS OWN CONTENT CLIPS.
 *
 * A docked section is as wide as the user's layout allows and may scroll; a
 * flyout is an overlay with the whole window to spend. The bug these pin: a
 * vertical flyout took the GROUP's width, so a 10-row symbol list opening out of
 * a narrow sidebar was rendered at the sidebar's width and every P/L value in it
 * was cut off behind a horizontal scrollbar.
 *
 * WHAT IS NOT COVERED HERE: the ceiling itself. It lives in `autoHide.css` as
 * `--acc-flyout-max-width`, and jsdom applies no stylesheet, so asserting it here
 * would test nothing. What IS covered is the half that decides whether the token
 * gets a chance to apply at all — vertical must NOT write an inline max-width,
 * horizontal must write `none`.
 */
```


---

# src/__tests__/hoverOpenDelay.test.tsx


## § src/__tests__/hoverOpenDelay.test.tsx:8

*THE HOVER-OPEN DELAY IS A HOST DECISION, and these assert the boundary between*

HEAD `src/__tests__/hoverOpenDelay.test.tsx:8` — 156 words. Attached to: `const OVERRIDE_MS = 50;`

```text
/**
 * THE HOVER-OPEN DELAY IS A HOST DECISION, and these assert the boundary between
 * the part that is and the part that is not.
 *
 * The 350ms default is sized for the horizontal RAIL, where reaching one button
 * means hovering every button above it in passing; the delay is the only thing
 * stopping that traverse from leaving a wake of overlays. A dock whose
 * activators are not on a traverse path — a two-section vertical sidebar — is
 * paying for a hazard it does not have, so the number is a prop.
 *
 * What is asserted is that the prop REPLACES the default rather than being
 * clamped, added to, or ignored, and that a nonsense value falls back to the
 * default instead of silently becoming zero. `setTimeout` treats a negative
 * delay as "next tick", so an unguarded override would turn a typo into "no
 * hover intent at all" — the exact failure the default exists to prevent, and
 * invisible when it happens.
 */
```


---

# src/__tests__/railDivider.test.ts


## § src/__tests__/railDivider.test.ts:10

*THE RAIL AS THE STATIC/DYNAMIC DIVIDER — contract tests.*

HEAD `src/__tests__/railDivider.test.ts:10` — 133 words. Attached to: `const NEVER = (): boolean => false;`

```text
/**
 * THE RAIL AS THE STATIC/DYNAMIC DIVIDER — contract tests.
 *
 * The rule under test is a STATE MODEL, not a layout detail: `pinned` means "opens
 * as a docked column rather than a flyout", open/closed is an independent axis,
 * and everything else — where a column paints, whether it has a rail button,
 * whether its splitter exists — is derived from that pair. So these tests assert
 * the derivation directly, over all four combinations of open × pinned, rather
 * than through a rendered group where each precondition would take a gesture to
 * arrange and could fail for reasons unrelated to the rule.
 *
 * The panel and the leaf inherit this behaviour by CALLING these functions (and
 * the test stub calls them too), which is what makes a contract test here worth
 * more than the same assertion repeated at three callsites.
 */
```


---

# src/__tests__/railOverflow.test.ts


## § src/__tests__/railOverflow.test.ts:10

*The rail's fit algorithm.*

HEAD `src/__tests__/railOverflow.test.ts:10` — 121 words. Attached to: `/** Two macrotask turns: one for Solid to flush its effects, one for the`

```text
/**
 * The rail's fit algorithm.
 *
 * jsdom has no layout engine, so every box here is stated explicitly by the test
 * (see `mount`). That is not a limitation being worked around — it is the only
 * way to assert a fit BOUNDARY, which is exactly where this algorithm is subtle
 * and where a real browser would give numbers nobody wrote down.
 *
 * What is NOT tested here: the flicker loop the module exists to prevent. That
 * loop is a property of the measure→decide→re-measure cycle over real layout, and
 * a stubbed environment cannot reproduce it. What IS tested is the structural
 * reason it cannot happen — the decision is a pure function of three inputs
 * (button extents, rail extent, trigger extent) that hiding a button cannot
 * change.
 */
```


---

# src/__tests__/slotRef.test.ts


## § src/__tests__/slotRef.test.ts:5

*`slotRef` is the contract that element registrations are undone, and undone on*

HEAD `src/__tests__/slotRef.test.ts:5` — 126 words. Attached to: `describe('slotRef', () => {`

```text
/**
 * `slotRef` is the contract that element registrations are undone, and undone only
 * by whoever actually put them there.
 *
 * It exists because Solid calls a `ref` exactly once — on creation, never on
 * unmount — so the natural spelling registers an element and then holds it
 * forever, including after it has left the document. A detached node measures as a
 * zero-size rect at the origin and swallows `.focus()` without error, so the
 * symptoms surface far from the cause (a popover in the corner of the screen, a
 * keystroke that does nothing) with a clean console.
 *
 * These are unit tests rather than browser tests deliberately: the property under
 * test is "does the cleanup run, and does it stay contained", which needs an owner
 * and a disposal, not a layout engine.
 */
```


## § src/__tests__/slotRef.test.ts:53

*THE second defect, and the reason `clear` is handed the element.*

HEAD `src/__tests__/slotRef.test.ts:53` — 109 words. Attached to: `const map = new Map<string, HTMLElement>();`

```text
/*
     * THE second defect, and the reason `clear` is handed the element.
     *
     * When one element replaces another under the same key, the OUTGOING element's
     * cleanup can run AFTER the incoming one has registered — an unconditional
     * `delete(key)` then removes the live element and the key resolves to nothing.
     *
     * Observed, not imagined: a vertical→horizontal orientation swap did exactly
     * this. The rail button mounted and registered, the outgoing vertical header
     * unmounted and cleared, and the panel was left with no activator at all — so
     * `activatorElOf` returned undefined, the flyout had no anchor and the keyboard
     * had no target. The opposite direction interleaved the other way and worked,
     * which is how it stayed hidden.
     */
```


## § src/__tests__/slotRef.test.ts:84

*THE regression test, and the reason the helper has a try/catch at all.*

HEAD `src/__tests__/slotRef.test.ts:84` — 128 words. Attached to: `const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});`

```text
/*
     * THE regression test, and the reason the helper has a try/catch at all.
     *
     * Solid unwinds an owner by walking its cleanups; an exception in one
     * abandons the walk, so every cleanup registered after it is silently
     * skipped. The first version of this helper read an id off a `<Show>`-provided
     * prop during teardown and threw a TypeError — and the cleanups that never ran
     * as a result included the tear-off controller's, so navigating away from the
     * dock left its popped-out OS windows orphaned on screen. The failure was two
     * layers from the line that threw and reported itself as nothing at all.
     *
     * `laterCleanup` stands in for that controller: it is registered AFTER the
     * throwing ref, so it is exactly what a resumed walk reaches and an abandoned
     * one does not.
     */
```


---

# src/__tests__/stubGroup.ts


## § src/__tests__/stubGroup.ts:10

*A hand-built `AccordionGroupApi` for tests.*

HEAD `src/__tests__/stubGroup.ts:10` — 232 words. Attached to: `export interface StubPanelSpec {`

```text
/**
 * A hand-built `AccordionGroupApi` for tests.
 *
 * WHY A STUB RATHER THAN A REAL `<AccordionGroup>`
 *
 * The modules under test — the breadcrumb path, the menu's enable/disable matrix,
 * the leaf chain — are pure functions of group STATE. Rendering a real group to
 * produce that state would mean driving it through the UI (click this, drag that)
 * to reach the case being tested, so a test for "Close Others is disabled when
 * every other open panel is pinned" would spend most of its length arranging
 * pins through a renderer and would fail for reasons that have nothing to do with
 * the assertion. Stating the state directly makes each test's precondition
 * readable in one line.
 *
 * WHAT STOPS IT DRIFTING
 *
 * Two different mechanisms, for two different kinds of drift:
 *
 *   - SHAPE. `group` below is annotated `AccordionGroupApi`, so a member added,
 *     removed, renamed or re-signatured on that interface fails the build here
 *     exactly as it does in `AccordionGroup`. No discipline required.
 *   - BEHAVIOUR. This is the kind a type checker cannot see, and the answer is
 *     not to test for it but to remove it: the rules that used to be copied here
 *     (the painted order, the bulk-close exemption) now live in `visualOrder.ts`
 *     and are CALLED, so there is no second implementation to go stale.
 *
 * What remains is deliberately inert — state held in local variables, and call
 * recording. Those cannot disagree with the real group because they make no claim
 * about it.
 */
```


---

# src/__tests__/tearOff.test.ts


## § src/__tests__/tearOff.test.ts:9

*Tear-off, smoke-tested against a stubbed `window.open`.*

HEAD `src/__tests__/tearOff.test.ts:9` — 172 words. Attached to: `/** Minimum window extent the geometry sampler will accept. Anything smaller is`

```text
/**
 * Tear-off, smoke-tested against a stubbed `window.open`.
 *
 * WHAT THIS DOES AND DOES NOT PROVE
 *
 * It proves the WIRING: that a tear-off opens a window and flips the signal, that
 * a blocked popup leaves the panel docked, that every route home funnels through
 * one close path, that geometry round-trips through storage, and that an opener
 * unloading takes its popups with it. Those are the parts that can be wrong in a
 * way no typechecker sees, and until now the whole module had never been executed
 * at all — not by a test and not by a user, because no demo card set
 * `tearOffable`, so the button that calls it did not render anywhere.
 *
 * It does NOT prove the cross-document rendering works. Whether a Portal's nodes
 * survive being re-parented into a real popup document, whether cloned stylesheets
 * paint there, and whether delegated events fire in a foreign document are all
 * properties of a real browser engine. jsdom has no rendering, so a green run here
 * is necessary and not sufficient — the browser check is still owed.
 */
```


---

# src/__tests__/verticalAutoHide.test.tsx


## § src/__tests__/verticalAutoHide.test.tsx:7

*AUTO-HIDE IN `vertical` — the parity contract.*

HEAD `src/__tests__/verticalAutoHide.test.tsx:7` — 130 words. Attached to: `function mountGroup(options: {`

```text
/**
 * AUTO-HIDE IN `vertical` — the parity contract.
 *
 * Auto-hide was horizontal-only, on the stated reasoning that a flyout anchored
 * to a full-width header "would cover its own siblings". Covering siblings is
 * what an overlay is; the claim that would have justified the exclusion is that
 * it covers its own ACTIVATOR, and a bottom-anchored flyout does not.
 *
 * These assert the behaviour that makes the two orientations the same feature,
 * plus the ONE structural difference between them (whether the docked shell is
 * removed from the layout). They are DOM-level rather than pixel-level: jsdom has
 * no layout, so "overlays rather than reflows" is asserted as "the panel does not
 * take a docked slot and its content is not in flow" — the mechanism that
 * produces the overlay — rather than by measuring boxes that jsdom would invent.
 */
```


---

# src/__tests__/visualOrder.test.ts


## § src/__tests__/visualOrder.test.ts:4

*The two rules, tested directly.*

HEAD `src/__tests__/visualOrder.test.ts:4` — 108 words. Attached to: `/** Membership predicate from a list. Reads at the callsite like the state it`

```text
/**
 * The two rules, tested directly.
 *
 * These are CONTRACT tests, not callsite tests, and that distinction is the whole
 * point of the extraction. Before it, the painted order and the bulk-close
 * exemption existed as inline expressions in `AccordionGroup`, copied into
 * `panelMenu` and into the test stub — so the only way to assert either rule was
 * through one of its consumers, which asserts that the consumer wired the copy up
 * correctly and says nothing about whether the copies agree.
 *
 * Here there is one implementation and these are its tests. The group, the menu
 * and the stub inherit the behaviour by calling it, so their own tests can stop
 * re-checking it.
 */
```


---

# src/AccordionGroup.tsx


## § src/AccordionGroup.tsx:82

*The rail acts as the BOUNDARY between the pinned columns and everything*

HEAD `src/AccordionGroup.tsx:82` — 142 words. Attached to: `railDivider?: boolean;`

```text
/**
   * The rail acts as the BOUNDARY between the pinned columns and everything
   * still dynamic: pinned columns paint before it (in pin order), it slides to
   * sit after them, and flyouts overlay from there on. A pinned column shows no
   * rail button while it is open — the column is the panel's presence — and the
   * rail collapses to zero width once nothing is left dynamic.
   *
   * Defaults to whatever `autoHide` is, because this is the layout `autoHide`
   * already implies rather than a second feature layered on it: auto-hide's whole
   * proposition is that pinning FREEZES a panel into permanence, and a frozen
   * panel that still sits downstream of the rail, still carrying a button that
   * re-reveals something already on screen, is only half of that metaphor. Set it
   * to `false` for a group that wants the rail welded to one edge.
   *
   * `horizontal` only, like `autoHide` itself.
   */
```


## § src/AccordionGroup.tsx:103

*How long a hovered activator waits before its flyout opens, ms. Default*

HEAD `src/AccordionGroup.tsx:103` — 139 words. Attached to: `hoverOpenDelayMs?: number;`

```text
/**
   * How long a hovered activator waits before its flyout opens, ms. Default
   * `FLYOUT_HOVER_ENTER_DELAY_MS` (350).
   *
   * The default is sized for the horizontal RAIL, where the pointer must travel
   * ALONG a stack of buttons to reach any one of them and every button in
   * between is hovered in passing — the delay is what stops that traverse
   * leaving a wake of opening overlays. A dock whose activators are not on a
   * traverse path (a short vertical sidebar, a single button) is paying for a
   * hazard it does not have, and should set this far lower.
   *
   * Only the OPEN delay is exposed. The leave grace
   * (`FLYOUT_HOVER_LEAVE_GRACE_MS`) is not: it exists so the pointer crossing
   * the few-px gap between activator and flyout does not dismiss the thing it
   * is reaching for, which is a geometric fact of the popover offset rather
   * than a preference.
   */
```


## § src/AccordionGroup.tsx:191

*Read a persisted layout, or null.*

HEAD `src/AccordionGroup.tsx:191` — 173 words. Attached to: `function readPersisted(key: string | undefined): PersistedState | null {`

```text
/**
 * Read a persisted layout, or null.
 *
 * VERSION-GATED, exactly like `setLayout`. The two paths restore the same shape
 * into the same signals, and only one of them used to check that the shape was
 * the one it expected: `setLayout` refused a mismatched `version` outright — "a
 * half-restored dock is harder to diagnose than one that visibly fell back to
 * defaults" — while this function, which runs on EVERY page load, read whatever
 * was in storage field by field with no version check at all.
 *
 * So the guarded path was the rare one and the unguarded path was the constant
 * one. Bumping `ACCORDION_LAYOUT_VERSION` for a shape change would have protected
 * consumers who saved a workspace server-side and silently mis-restored everyone
 * who had simply used the dock before.
 *
 * A layout with no `version` at all is from before this gate existed, and is
 * rejected by the same comparison rather than by a special case — there is no
 * shape to migrate FROM on record, so "fall back to defaults" is the honest
 * answer and the one `setLayout` already gives.
 */
```


## § src/AccordionGroup.tsx:259

*Open MEMBERSHIP. Kept as an array rather than a Set only so persistence has a*

HEAD `src/AccordionGroup.tsx:259` — 102 words. Attached to: `const [openList, setOpenList] = createSignal<readonly string[]>(persisted?.open ?? []);`

```text
/**
   * Open MEMBERSHIP. Kept as an array rather than a Set only so persistence has a
   * stable serialisation; the on-screen sequence does NOT come from here.
   *
   * That sequence is `orderIds` — one order, rendered twice (rail + columns). It is
   * the reason dragging a rail button moves its column and dragging a column moves
   * its rail button: there is nothing to keep in sync, because there is only one
   * thing. An earlier draft made open-order the column order and left the rail on
   * declaration order, which meant the two representations disagreed the moment
   * anything was dragged — two orders is a bug surface, not a feature.
   */
```


## § src/AccordionGroup.tsx:378

*Is this panel currently an auto-hide OVERLAY rather than a column?*

HEAD `src/AccordionGroup.tsx:378` — 115 words. Attached to: `let isFlyoutId: (id: string) => boolean = () => false;`

```text
/**
   * Is this panel currently an auto-hide OVERLAY rather than a column?
   *
   * Late-bound with a `false` default because `createAutoHide` needs the finished
   * `api` object, so it cannot exist yet at this point in the body — and
   * `visualOpenIds` below is an eagerly-evaluated memo, so a bare `let` read here
   * would hit the temporal dead zone on the group's very first render. The default
   * is the correct answer for every group that never turns auto-hide on, which is
   * also what this returns for the one frame before the assignment lands.
   *
   * It stays reactive through the wrapper: the assigned implementation reads
   * `enabled`/`orientation`/`isOpen`/`isPinned`, and this indirection does not
   * break that chain because the call happens inside the reader's tracking scope.
   */
```


## § src/AccordionGroup.tsx:468

*THE writer for open membership. Every path that changes which panels are open*

HEAD `src/AccordionGroup.tsx:468` — 142 words. Attached to: `const commitOpen = (next: readonly string[], justOpened?: string): void => {`

```text
/**
   * THE writer for open membership. Every path that changes which panels are open
   * goes through here — `setOpen`, `expandAll`, `collapseAll`, `setLayout` — and
   * that is not a stylistic preference, it is where two invariants are enforced.
   *
   * The cap USED to be applied in `setOpen` only, so `expandAll` and `setLayout`
   * both sailed past it: a group with `maxOpen={2}` opened all six of its panels
   * if the consumer called `expandAll()`. A cap that three of four writers honour
   * is not a cap. Applying it here makes "more than `maxOpen` panels are open" a
   * state the group cannot represent, rather than one that four callsites have to
   * remember to avoid.
   *
   * `justOpened` names the panel that must survive eviction — the one the user
   * just asked for. Bulk paths pass nothing, and then the cap simply evicts the
   * least recently opened, which is the same rule with no exception.
   */
```


## § src/AccordionGroup.tsx:517

*Enforce `maxOpen` by evicting least-recently-opened panels.*

HEAD `src/AccordionGroup.tsx:517` — 139 words. Attached to: `const evictForCap = (next: readonly string[], justOpened?: string): readonly string[] => {`

```text
/**
   * Enforce `maxOpen` by evicting least-recently-opened panels.
   *
   * `openList` is insertion-ordered, so its FRONT is the least recently opened —
   * that is the whole reason open membership is stored as an ordered array now that
   * the on-screen sequence comes from `order` instead. Eviction skips pinned panels
   * and leaves: the pin's entire job in this control is to survive bulk operations,
   * and a leaf is the result of a selection rather than a panel competing for space.
   *
   * If every open panel is exempt the cap simply does not bind — refusing to open the
   * new panel would be a worse failure than briefly exceeding a soft limit, because
   * the user's click would appear to do nothing.
   *
   * `justOpened` is optional because the bulk writers (`expandAll`, `setLayout`)
   * have no such panel: nothing there was "just asked for", so nothing is exempt
   * and eviction is plain least-recently-opened.
   */
```


## § src/AccordionGroup.tsx:936

*Two panels sharing an id silently became ONE registration: the second*

HEAD `src/AccordionGroup.tsx:936` — 101 words. Attached to: `// eslint-disable-next-line no-console -- see above`

```text
/*
         * Two panels sharing an id silently became ONE registration: the second
         * lost its chrome (the rail renders the first one's title and count), both
         * toggled together because open state is keyed by id, and whichever
         * unmounted first unregistered the pair. Every symptom of that reads as a
         * bug in the dock rather than as a duplicated string in the caller's JSX.
         *
         * Reported rather than thrown: the group's other panels are unaffected and
         * still work, so taking the whole dock down would turn a chrome bug into an
         * outage. `id` is documented as unique among siblings; this is that
         * document made noisy.
         */
```


## § src/AccordionGroup.tsx:984

*No manual element purge here. Every element reference is filled through a*

HEAD `src/AccordionGroup.tsx:984` — 149 words. Attached to: `if (wasLeaf && openList().includes(id)) {`

```text
// No manual element purge here. Every element reference is filled through a
      // slot and emptied by that slot's own cleanup when the element unmounts, so
      // deleting them again on unregister would be a second, unguarded clear —
      // exactly the one `slotRef` documents as deleting a live replacement.
      // The ORDER entry deliberately survives: a panel that unmounts and remounts
      // (a route change, a `<Show>`) must come back where the user put it, not at
      // the end of the rail.
      //
      // A LEAF's open state does NOT survive, and the asymmetry is the point. A
      // panel's open state is the group's own — remembering it across a remount is
      // the same courtesy as remembering its position. A leaf's is a mirror of a
      // prop the consumer owns, so a stale entry is not a memory, it is a claim
      // about a component that no longer exists; it kept `isOpen` true forever and
      // was persisted.
```


---

# src/AccordionLeaf.tsx


## § src/AccordionLeaf.tsx:74

*A terminal detail pane at the end of the dock.*

HEAD `src/AccordionLeaf.tsx:74` — 239 words. Attached to: `export function AccordionLeaf(props: AccordionLeafProps): JSX.Element {`

```text
/**
 * A terminal detail pane at the end of the dock.
 *
 * This is the piece that turns the accordion into a MILLER-COLUMN browser: each
 * panel is a folder whose selection opens the next column, and the leaf is the file
 * at the end of the chain — a detail view, not another folder. It differs from a
 * panel in exactly four ways, all of which follow from "it has no activator":
 *
 *   1. No rail button and no clickable header (nothing to activate).
 *   2. Not reorderable — it is terminal by definition, so it is kept out of the
 *      user order entirely rather than being draggable into the middle.
 *   3. Exempt from `single`-policy auto-collapse. The leaf is the RESULT of the
 *      selection the user just made; collapsing it on the next click would destroy
 *      the thing that click produced.
 *   4. Controlled `open` — see the prop.
 *
 * It IS a first-class member for sizing: it resizes with a splitter and persists its
 * width like any column.
 *
 * TERMINAL IS NOT THE SAME AS LAST. A leaf may name a `parentId` and so become a
 * WAYPOINT in a chain — `file → symbol → reference` — while keeping every one of
 * the four properties above. Nothing in that list says "there is only one of me";
 * it says "I have no activator", and a chained leaf has no activator either. What
 * chaining adds is a dependency, and the two consequences below both fall out of
 * it rather than being separate features.
 */
```


## § src/AccordionLeaf.tsx:126

*The leaf is open only when the consumer says so AND its parent is open.*

HEAD `src/AccordionLeaf.tsx:126` — 198 words. Attached to: `const effectiveOpen = (): boolean => props.open && parentOpen();`

```text
/**
   * The leaf is open only when the consumer says so AND its parent is open.
   *
   * This is the CASCADE, and putting it here — in one derived accessor that gates
   * the render, the size and the group's open list together — is the whole answer
   * to "who enforces it". The alternative was to leave it to the consumer, which
   * fails for a structural reason rather than a diligence one: the consumer would
   * have to remember, at every place that can close a parent (the parent's ×, a
   * breadcrumb truncation, a selection change three columns upstream, a
   * `collapseAll`), to also clear every descendant's state. Every one of those
   * sites is a chance to produce the exact artefact this must never show — a
   * "references" column describing a symbol whose file is no longer open. A pane
   * that reads as current while describing something closed is not a cosmetic bug;
   * it is the UI asserting something false.
   *
   * Deriving it instead means there is no site to forget. The child cannot outlive
   * the parent because "open" is defined as "my parent is open and I was asked to
   * be", and depth is free: B hides when A closes, which hides C, and so on down.
   */
```


## § src/AccordionLeaf.tsx:224

*Tell the consumer when the cascade fired, so the selection that opened this*

HEAD `src/AccordionLeaf.tsx:224` — 128 words. Attached to: `createEffect(`

```text
/**
   * Tell the consumer when the cascade fired, so the selection that opened this
   * leaf gets cleared.
   *
   * Reuses `onClose` rather than adding a second callback, because the two cases
   * ask for exactly the same thing: "the state behind this pane is no longer
   * valid, drop it." Without this the cascade would still LOOK right — the pane is
   * already hidden by `effectiveOpen` — but the consumer's signal would still hold
   * the old selection, and reopening the parent would resurrect a stale child.
   *
   * `defer` skips the mount pass: a leaf whose parent has not registered yet must
   * not read that as a close and fire on the consumer before anything happened.
   * `props.open` is read untracked so this fires on the PARENT's edge only, not
   * every time the consumer toggles the leaf itself.
   */
```


## § src/AccordionLeaf.tsx:264

*A closed leaf UNMOUNTS, unlike a panel, which stays mounted and hidden.*

HEAD `src/AccordionLeaf.tsx:264` — 148 words. Attached to: `return (`

```text
/*
   * A closed leaf UNMOUNTS, unlike a panel, which stays mounted and hidden.
   *
   * The asymmetry is deliberate and worth stating, because the panel's rule is
   * documented as a feature ("a scroll position, a text selection or an in-flight
   * edit inside a panel survives the user looking at a sibling") and a reader could
   * reasonably expect it here.
   *
   * A leaf is the RESULT of a selection made upstream — the references for a
   * symbol, the detail for a row. When it closes, the selection behind it is gone
   * (that is what `requestClose` and the cascade mean), so there is no state worth
   * preserving: restoring the scroll position of a pane describing a file the user
   * has navigated away from would be restoring a view of something that no longer
   * applies. Keeping it mounted would also keep whatever it renders alive —
   * subscriptions, timers, a fetch — for content nothing points at any more.
   */
```


---

# src/AccordionPanel.tsx


## § src/AccordionPanel.tsx:62

*This panel absorbs the group's leftover extent in `fill` mode.*

HEAD `src/AccordionPanel.tsx:62` — 143 words. Attached to: `grow?: boolean;`

```text
/**
   * This panel absorbs the group's leftover extent in `fill` mode.
   *
   * `fill` divides the group's whole extent, but every explicitly-sized member is
   * fixed, so something has to take what is left or the group paints a dead strip.
   * With no declaration anywhere that job falls to the TRAILING member, which is
   * safe (it has no splitter handle of its own, so growing it overrides nothing the
   * user dragged) but is not necessarily right — only you know which of your
   * panels can actually use the room.
   *
   * Declare it on the panel whose content is unbounded. Declare it on SEVERAL and
   * they share the surplus equally, each starting from its own size and scrolling
   * past its share — the right shape when two sections both hold content of
   * unpredictable length. The declared size (`defaultSize`, a drag, a persisted
   * layout) becomes the flex BASIS rather than being discarded.
   */
```


## § src/AccordionPanel.tsx:79

*This panel is never taller (or wider) than its own content.*

HEAD `src/AccordionPanel.tsx:79` — 143 words. Attached to: `shrinkToContent?: boolean;`

```text
/**
   * This panel is never taller (or wider) than its own content.
   *
   * Its size becomes a CEILING rather than an extent: shorter content means a
   * shorter panel, and content past the ceiling scrolls inside it. Whatever the
   * group has left over stays empty — which is the point, for a nav sidebar whose
   * sections should look like the lists they hold rather than being stretched to
   * fill a column.
   *
   * Pair it with NO `defaultSize`. A ceiling measured from the content is one the
   * content is already touching, so a `'content'` seed would freeze the panel at
   * whatever it held when it first opened; leave it unsized and let a splitter drag
   * set the ceiling deliberately. Note that dragging one of these LARGER than its
   * content shows nothing until the content grows into the new ceiling — see
   * `columnFlex`.
   *
   * Overrides `grow`, which asks for the opposite thing.
   */
```


## § src/AccordionPanel.tsx:169

*The drag ITEM is the whole panel; the header (or column title bar) is only the*

HEAD `src/AccordionPanel.tsx:169` — 103 words. Attached to: `const dragItem = (): Record<string, unknown> =>`

```text
/**
   * The drag ITEM is the whole panel; the header (or column title bar) is only the
   * HANDLE.
   *
   * These were the same element at first — the primitive's `itemProps` bundles the
   * ref and the pointerdown together, so spreading it on the header registered the
   * HEADER as the thing being dragged. The reorder engine then measured header
   * rects and translated a lone 26px bar over a layout that never moved, which in
   * `fill` mode (where a panel's height is flex-derived, not content-derived) looked
   * like nothing was happening at all. Splitting them means the engine measures and
   * moves the panels — the things the user is actually rearranging.
   */
```


## § src/AccordionPanel.tsx:392

*THE TITLE BAR IS AN ACTIVATOR, not a label.*

HEAD `src/AccordionPanel.tsx:392` — 182 words. Attached to: `}`

```text
/*
            THE TITLE BAR IS AN ACTIVATOR, not a label.
            Clicking it COLLAPSES the column back to a rail button while the panel
            stays pinned — "put this away, it still docks" — which is the third
            control on a pinned column and the one that makes `pinned` mean "opens
            as a column" rather than "is open". The × beside it is the other half:
            same close, but it drops the pin too. Two paths, two names
            (`collapseKeepPin` / `closeAndUnpin`), deliberately NOT folded into one
            handler — the difference between them is the whole state model.

            A real <button> with `aria-expanded` / `aria-controls` and the SAME
            `createActivatorKeyDown` the vertical header and the rail button use.
            The third activator in this control, and now the third to share that
            helper rather than hand-rolling keyboard support.

            The DRAG HANDLE moves onto this button too, exactly as the vertical
            header does it: the panel is the drag ITEM and its activator is the
            HANDLE. `createReorderList` fires its own pointerdown gesture and the
            click only lands if the pointer never crossed the drag threshold, so a
            reorder cannot end in an accidental collapse.
          */
```


## § src/AccordionPanel.tsx:483

*ONE Portal whose mount toggles — never a <Show> swapping an inline branch*

HEAD `src/AccordionPanel.tsx:483` — 126 words. Attached to: `}`

```text
/*
        ONE Portal whose mount toggles — never a <Show> swapping an inline branch
        for a portalled one.

        Portal caches its children memo and reads `mount` inside an effect, so
        changing the mount MOVES the existing nodes and keeps the reactive graph
        intact. Swapping branches would re-evaluate the children and destroy
        exactly the scroll position and in-flight edits that this panel's
        stay-mounted-while-collapsed rule exists to protect — the same mechanism
        the tear-off module documents for popup windows.

        That is why the docked case portals too, into an empty host div right here
        rather than rendering directly: it makes docked and flying-out the SAME
        code path with a different mount, so promoting a flyout to a column cannot
        remount anything. A plain `mount={undefined}` would not do — Portal
        defaults to document.body.
      */
```


---

# src/autoHide.css


## § src/autoHide.css:1

*AUTO-HIDE / FLYOUT styling.*

HEAD `src/autoHide.css:1` — 229 words. Attached to: `/*`

```text
/*
 * AUTO-HIDE / FLYOUT styling.
 *
 * Separate file from `styles.css` on purpose: auto-hide is an opt-in mode
 * (`autoHide` prop), and its rules are worthless to a consumer who never turns
 * it on. Import next to `./styles.css` in `index.ts`.
 *
 * UNLAYERED, like `rail.css` and `breadcrumb.css`.
 *
 * This file used to wrap every rule in `@layer cujuju-defaults`, on the stated
 * premise that it was matching `styles.css`. That premise was FALSE: `styles.css`
 * layers only its token block (`:root` + the density overrides) and leaves every
 * component rule — including `.acc-panel { display: flex }` — unlayered.
 *
 * Unlayered declarations beat layered ones outright, ahead of specificity. So
 * every rule in here that competed with a component rule silently lost, no matter
 * how specific it was. `.acc-panel[data-flyout='true'] { display: none }` is the
 * one that mattered: a flying-out panel's docked column was never removed from the
 * layout, so it kept its slot and painted its title bar over the flyout floating
 * in front of it. Caught by a browser test; invisible to jsdom, which has no
 * cascade, and invisible to specificity arithmetic, which was not the deciding
 * factor.
 *
 * Token declarations stay layered below, which is the property the original
 * comment was reaching for and the one worth keeping: a consumer restating
 * `--acc-flyout-shadow` unlayered wins without having to out-specify us.
 *
 * Every value here is either an existing `--acc-*` token or a variable the
 * flyout's own JS sets on the popover shell (`--acc-flyout-width`,
 * `--acc-flyout-max-height` — see `autoHide.tsx`). No literals.
 */
```


## § src/autoHide.css:33

*The panel's docked shell, while its content is living in a flyout.*

HEAD `src/autoHide.css:33` — 238 words. Attached to: `.acc-group[data-orientation='horizontal'] > .acc-panel[data-flyout='true'] {`

```text
/*
 * The panel's docked shell, while its content is living in a flyout.
 *
 * The panel element stays MOUNTED (it owns the refs the group measures and
 * the identity the reorder list tracks) but must not take part in the column
 * layout — a flyout is an overlay, and the whole point is that the columns do
 * not reflow to make room for it.
 *
 * It competes with `.acc-panel { display: flex }` in styles.css and wins on
 * specificity — (0,2,0) against (0,1,0) — but ONLY because both rules now sit in
 * the same cascade layer. While this file was wrapped in `@layer
 * cujuju-defaults` and that rule was not, specificity never got a vote and the
 * column stayed in the layout. See the file header.
 *
 * HORIZONTAL ONLY, and this is the one structural difference between the two
 * orientations. In horizontal the panel's activator is a rail button the GROUP
 * renders, so removing the whole column takes nothing with it. In vertical the
 * activator is the panel's OWN header bar: hiding the panel would hide the
 * header, which is both the flyout's anchor and the only way to dismiss it —
 * the flyout would be left pointing at an element that no longer has a box.
 * A vertical flying-out panel therefore stays in flow showing just its header,
 * which is exactly what a collapsed panel looks like; its content is already
 * out of the layout because `AccordionPanel` marks the inline host `hidden`
 * while the subtree is portalled away.
 */
```


## § src/autoHide.css:235

*ZERO BY DEFAULT, matching `--acc-duration`: a flyout is an overlay the*

HEAD `src/autoHide.css:235` — 115 words. Attached to: `--acc-flyout-in-duration: 0ms;`

```text
/* ZERO BY DEFAULT, matching `--acc-duration`: a flyout is an overlay the
         user asked for and is already reaching toward, so time spent revealing
         it is time it cannot be clicked. The keyframes and the `animation`
         declaration stay — a 0ms animation is inert — so raising this token is
         all it takes to get the reveal back.

         Was 110ms, for "long enough that the direction of travel registers,
         which is what tells them where the panel came from". That reasoning
         holds for a RAIL, where the flyout emerges from a 40px strip and its
         origin is genuinely ambiguous. It is much weaker for a vertical dock,
         where the flyout drops directly under the header that was clicked. */
```


---

# src/autoHide.tsx


## § src/autoHide.tsx:22

*AUTO-HIDE — an unpinned panel opens as a transient FLYOUT over the columns*

HEAD `src/autoHide.tsx:22` — 612 words. Attached to: `/**`

```text
/**
 * AUTO-HIDE — an unpinned panel opens as a transient FLYOUT over the columns
 * instead of as a docked column that reflows the layout. Pinning promotes it to
 * a real column; unpinning demotes it back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CENTRAL DESIGN DECISION: flyout-ness is DERIVED, never stored.
 *
 *     isFlyout(id)  ⇔  autoHide ∧ isOpen(id) ∧ ¬isPinned(id) ∧ ¬isLeaf(id)
 *
 * There is no `flyingOut` set, no promote() and no demote(). `togglePin` already
 * flips `isPinned`, so pin-while-flying-out becomes a column and unpin-a-column
 * becomes a flyout with ZERO transition code — the predicate simply reads
 * differently on the next render. Persistence needs nothing new either: `open`
 * and `pinned` are already persisted, and together they reconstruct the flyout
 * state exactly.
 *
 * Storing a third state would have meant three states that can disagree
 * (open/pinned/flying-out), a reconciliation rule for every pair, and a
 * migration for the persisted layout. The derivation cannot disagree with
 * itself.
 *
 * It also makes the pin mean what the phase is for. Today the pin means "exempt
 * from auto-collapse"; here `pinned` IS the docked/transient axis, and the
 * existing exemption falls out of it rather than competing with it.
 *
 * WHAT THIS BUYS FOR FREE — no code in this file, and none needed in the group:
 *
 *  - `single` policy: `setOpen` already closes every unpinned sibling on open.
 *    Under auto-hide "unpinned" means "is a flyout", so opening a flyout closes
 *    the other FLYOUTS and leaves docked columns alone. That is exactly the
 *    rule this phase wants (see the answer to Q5 in the handoff) and it is the
 *    existing code path, untouched.
 *  - `collapseAll` (closes unpinned, spares pinned) becomes "dismiss every
 *    flyout, keep every docked column".
 *  - `expandAll` under `multi` opens flyouts, not columns — which is the
 *    non-destructive reading of it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS REUSED RATHER THAN REBUILT
 *
 * Placement, viewport clamping, outside-click dismiss, Escape dismiss and the
 * top-layer shell all come from `@cujuju/solidjs-anchored-popover`, which is
 * already a playground dependency. Nothing in this file computes a rect. See
 * the handoff for the point-by-point fit assessment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCOPE — auto-hide applies to BOTH orientations. One rule, one axis rotated.
 *
 * The invariant that matters is that THE ACTIVATOR SURVIVES THE DISMISSAL, so
 * there is always a way back. Both orientations satisfy it, by different means:
 *
 *   horizontal — the activator is a rail button in a permanent strip that no
 *                overlay covers. The flyout emerges from the rail's outer edge,
 *                over the columns.
 *   vertical   — the activator is the panel's own header bar, which stays in
 *                flow. The flyout is anchored BELOW it (`bottom-start`), so it
 *                covers the content and the sibling panels beneath — never the
 *                bar it came from. Dismissing it returns the bar to a collapsed
 *                panel, which is a visible change of state, not a no-op.
 *
 * This file previously declared vertical out of scope on the reasoning that "an
 * overlay anchored to a full-width header would cover its own siblings". Covering
 * siblings is what an overlay IS — the horizontal one covers the columns, which
 * is the entire proposition. The claim that would have justified the exclusion is
 * that it covers its own ACTIVATOR, and a bottom-anchored flyout does not: it
 * opens away from the bar, exactly as the horizontal one opens away from the
 * rail. The exclusion was wrong as stated and is removed.
 *
 * What genuinely differs between the two is the CROSS-AXIS size, and only that:
 * a horizontal flyout is as wide as its own panel (so pinning does not resize
 * it), while a vertical flyout is as wide as its CONTENT — floored at the width
 * of the section it came from. A vertical panel has no private width to preserve,
 * so there is nothing to inherit except the dock's own narrowness, and inheriting
 * that is what made a flyout clip the very content it exists to show. See
 * `flyoutCrossAxis`, which owns the rule and states it in full.
 */
```


## § src/autoHide.tsx:100

*Delay before a hovered rail button opens its flyout, ms.*

HEAD `src/autoHide.tsx:100` — 131 words. Attached to: `export const FLYOUT_HOVER_ENTER_DELAY_MS = 350;`

```text
/**
 * Delay before a hovered rail button opens its flyout, ms.
 *
 * The rail is a stack of buttons the pointer must travel ALONG to reach any
 * particular one, so every intervening button is hovered in passing. The delay
 * has to exceed that incidental dwell or the traverse leaves a wake of opening
 * overlays.
 *
 * Estimate behind the value (called out as an estimate — not measured here): a
 * rail button is ~28-40px tall, and a deliberate pointer traverse runs at
 * roughly 400-800 px/s, so an intervening button is under the pointer for
 * ~35-100ms. 350ms clears the slow end of that by ~3.5x, while staying well
 * under the ~1s mark where a delay starts reading as "the app is stuck" rather
 * than "I have not committed yet". Tune against real input, not against this
 * arithmetic.
 */
```


## § src/autoHide.tsx:118

*Grace period after the pointer leaves the rail button or the flyout, before*

HEAD `src/autoHide.tsx:118` — 156 words. Attached to: `export const FLYOUT_HOVER_LEAVE_GRACE_MS = 260;`

```text
/**
 * Grace period after the pointer leaves the rail button or the flyout, before
 * the flyout dismisses, ms.
 *
 * Two jobs. First, the pointer crossing the gap between the button and the
 * flyout is briefly over NEITHER — without a grace period the flyout would
 * dismiss in the act of being reached. Second, a pointer that overshoots the
 * flyout's edge by a few px on the way to a control inside it must not be
 * punished.
 *
 * Deliberately shorter than the enter delay: opening is the destructive,
 * uncommitted act (an overlay the user did not ask for), closing is the
 * recoverable one (hover again). Asymmetry favours the cheaper mistake.
 *
 * A "safe triangle" (tracking pointer trajectory toward the flyout) was
 * considered and rejected: the anchor gap here is the popover's 4px default, so
 * the corridor between button and flyout is a few pixels wide and effectively
 * unmissable. Trajectory tracking earns its complexity on wide submenu fans, not
 * on an adjacent panel.
 */
```


## § src/autoHide.tsx:154

*The flyout's CROSS-AXIS sizing, as three CSS values.*

HEAD `src/autoHide.tsx:154` — 320 words. Attached to: `export function flyoutCrossAxis(input: {`

```text
/**
 * The flyout's CROSS-AXIS sizing, as three CSS values.
 *
 * A pure function on purpose: this is the rule that decides whether a flyout can
 * clip its own content, and it is worth testing without needing layout — the
 * measurements come in as numbers, the decision goes out as strings.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A DOCKED section is as wide as the user's layout allows and may scroll. A
 * FLYOUT is an overlay with the whole window to spend, so it must never be the
 * reason content clips. The two orientations reach that differently because they
 * differ in whether a user-chosen width exists at all:
 *
 * horizontal — the panel's OWN width, used as an exact width. That number is a
 *   real choice (a column is as wide as the user dragged it), so a flyout is
 *   shown at it and promotion to a column does not resize anything. It also
 *   cannot overflow the viewport, being a width that already fits in the dock,
 *   so it needs no ceiling.
 *
 * vertical — the CONTENT's natural width (`max-content`), floored at the
 *   anchor's width and capped by `--acc-flyout-max-width`. A vertical panel has
 *   no private width — it spans the dock, and `sizeOf` on this axis is its HEIGHT
 *   — so there is no user choice to preserve, only the dock's own narrowness to
 *   avoid inheriting. Handing a flyout the group's width is what put a horizontal
 *   scrollbar under a 10-row symbol list in a narrow sidebar and clipped every
 *   P/L value in it.
 *
 * The FLOOR keeps a flyout from ever being narrower than the section it came out
 * of, which would read as the panel shrinking on open. The CEILING is left to the
 * stylesheet token rather than written here, so a consumer can restate it — and
 * so a pathological row scrolls horizontally INSIDE the flyout instead of
 * spanning the window. That last resort is deliberate: clipping data silently is
 * worse than a scrollbar, so the scrollbar is what a genuinely-too-wide row gets.
 */
```


## § src/autoHide.tsx:221

*The inherited CSS properties a Portal'd flyout must be told, because it cannot*

HEAD `src/autoHide.tsx:221` — 285 words. Attached to: `const INHERITED_TYPOGRAPHY = [`

```text
/**
 * The inherited CSS properties a Portal'd flyout must be told, because it cannot
 * inherit them.
 *
 * THE CLASS OF BUG THIS CLOSES. This control deliberately owns no typography:
 * `.acc-rail-btn`, `.acc-rail-overflow` and the header all declare `font:
 * inherit`, so a dock adopts whatever type scale its host page sets on an
 * ancestor. That contract holds for every docked column — they are real
 * descendants of the group — and silently breaks for a flyout, which is Portal'd
 * to `<body>` and therefore inherits from the document root instead. A host that
 * sets a 12px body scale on its panel container gets 12px columns and a 16px
 * flyout: the SAME panel renders at two physical sizes depending only on whether
 * it happens to be pinned. (Observed in StockApp's Risk Console, whose panel root
 * carries a `text-body` = 12px utility class; the symbol cards grew on hover.)
 *
 * The fix is at the portal boundary rather than per-property, because the bug is
 * not "font-size is wrong" — it is "inheritance stops at the Portal". Two other
 * instances were already patched one at a time before this list existed: the
 * per-panel `--acc-accent` (restated in `shellStyle`) and the group's density
 * (restated as `data-density` on the flyout host). Those are custom properties
 * and an attribute; these are the real inherited properties, which no `:root`
 * token restatement can reach.
 *
 * Scope is TYPOGRAPHY, deliberately, and not "every inherited property":
 * `color`, `cursor` and `visibility` are also inherited, but the flyout sets its
 * own `color` from `--acc-text` (a token, so it already crosses the portal) and
 * copying the rest would import state the surface is meant to define for itself.
 * Anything a host needs beyond this list is a token restatement at `:root`, the
 * same escape hatch the colour palette already uses.
 */
```


## § src/autoHide.tsx:260

*Read the typography the group resolves to, as inline style for the flyout.*

HEAD `src/autoHide.tsx:260` — 107 words. Attached to: `function inheritedTypographyOf(groupEl: Element | null | undefined): Record<string, string> {`

```text
/**
 * Read the typography the group resolves to, as inline style for the flyout.
 *
 * The LONGHANDS rather than the `font` shorthand: `getComputedStyle().font`
 * serializes to an empty string whenever the longhands cannot be losslessly
 * expressed as one shorthand (which is most real pages, and every page whose
 * `line-height` came from a separate declaration), so the shorthand reads as
 * "no typography" exactly when there is some. `letter-spacing` is outside the
 * shorthand entirely and would be dropped by it in all cases.
 *
 * Returns nothing when the group is not reachable — a flyout with the document's
 * typography is the status quo, and inventing values would be worse than
 * inheriting the wrong ones.
 */
```


## § src/autoHide.tsx:315

*Elements whose pointerdown must NOT dismiss a flyout.*

HEAD `src/autoHide.tsx:315` — 102 words. Attached to: `const DISMISS_SUPPRESS_SELECTOR = `${POPOVER_STACK_SELECTOR}, [popover]:not(.${FLYOUT_SHELL_CLASS})`;`

```text
/**
 * Elements whose pointerdown must NOT dismiss a flyout.
 *
 * A right-click inside a flyout opens the panel context menu, which
 * `ContextMenu` Portals to `<body>` and promotes into the top layer — so by DOM
 * ancestry it is OUTSIDE the flyout, and the naive dismiss would tear the
 * flyout down from under its own menu, taking the menu's reason for existing
 * with it. Any open popover counts, plus the submenu stack above.
 *
 * `:not(.acc-flyout-shell)` deliberately EXCLUDES our own kind: under `multi`
 * policy two flyouts can coexist, and clicking into one of them is a genuine
 * "you left the other one" signal that should dismiss the other.
 */
```


## § src/autoHide.tsx:463

*Drop the open-cause for anything that is no longer open.*

HEAD `src/autoHide.tsx:463` — 116 words. Attached to: `createEffect(() => {`

```text
/**
   * Drop the open-cause for anything that is no longer open.
   *
   * `dismiss` deletes its own entry, but a flyout can stop being open without
   * going through it — the panel unregisters, `collapseAll` runs, a restore
   * replaces the open set. Those left an entry behind for an id that might never
   * come back, and if it DID come back (a remount, a reopened panel) it would
   * arrive still labelled 'hover' and dismiss itself the moment the pointer moved.
   *
   * An effect over the open set rather than a hook on unregister: this is derived
   * state, so it is cheaper and more honest to recompute it than to arrange for
   * every path that can close a panel to remember to notify.
   */
```


## § src/autoHide.tsx:612

*The whole flyout SURFACE for a panel, not just its content mount.*

HEAD `src/autoHide.tsx:612` — 120 words. Attached to: `const surfaceOf = (id: string): Element | undefined => {`

```text
/**
   * The whole flyout SURFACE for a panel, not just its content mount.
   *
   * `hosts` registers `.acc-flyout-host`, which is only where the panel's subtree
   * portals in. The surface around it also holds chrome — the flyout's own title
   * bar, with the pin and the close — and those are as much "inside the flyout"
   * as the content is.
   *
   * Getting this wrong was not cosmetic: focusing the pin landed outside `host`,
   * so the tab-away handler read it as focus leaving and dismissed the panel
   * before the click could toggle anything. The pin appeared to close the panel.
   * Resolved by climbing from the host so that any chrome added later is covered
   * automatically, rather than by registering a second element that a future
   * addition could forget.
   */
```


## § src/autoHide.tsx:672

*A DELIBERATELY-opened flyout takes focus; a hover-opened one does not.*

HEAD `src/autoHide.tsx:672` — 124 words. Attached to: `autoFocus={causes.get(id) !== 'hover'}`

```text
/*
           * A DELIBERATELY-opened flyout takes focus; a hover-opened one does not.
           *
           * Without this the flyout's content had no keyboard path at all. Focus
           * stayed on the rail button, the popover is Portal'd to the end of
           * <body> so it is nowhere near the button in tab order, and the first
           * Tab moved focus to the next rail button — which `onFocusIn` reads as
           * "you left" and dismisses. Every route in was also a route out.
           *
           * Hover is excluded because a pointer user has not committed to
           * anything: yanking focus out from under them mid-traverse would move
           * the caret while they are still deciding. `causes` records 'hover' only
           * for a hover-open, so its ABSENCE is the deliberate case — click,
           * Enter/Space on the rail button, or a restore.
           */
```


## § src/autoHide.tsx:734

*Move focus in, once the popover is actually focusable.*

HEAD `src/autoHide.tsx:734` — 130 words. Attached to: `const focusSurface = (): void => {`

```text
/**
   * Move focus in, once the popover is actually focusable.
   *
   * Driven by the primitive's `onShown` rather than by a frame of our own. A
   * popover is `display: none` until it enters the top layer and unpositioned for a
   * frame after that, and both states swallow `.focus()` silently — an element the
   * browser will not paint is an element it will not focus. Every schedule this
   * file could choose is a guess: the ref fires before the show, an effect created
   * here runs before the primitive's (this component's body runs first), and a
   * single `requestAnimationFrame` happened to land too early in Chromium.
   *
   * That was not theory — it was the first attempt, and it failed exactly that way:
   * the flyout was visible and `:popover-open` by the time anything checked, and
   * focus had never moved.
   */
```


## § src/autoHide.tsx:857

*Pointer intent is asked of the WHOLE surface, not of the content host.*

HEAD `src/autoHide.tsx:857` — 143 words. Attached to: `contentRef={(el) => {`

```text
/*
        Pointer intent is asked of the WHOLE surface, not of the content host.
        These three listeners lived on `.acc-flyout-host` — the element the
        panel's subtree portals into — which is only PART of the flyout: the
        title bar is its sibling, not its descendant. `pointerleave` does not
        bubble and fires per element, so moving the pointer from the content up
        into the title bar left the host and entered nothing that was listening.
        The grace timer then ran to completion and dismissed the flyout out from
        under a pointer that had never left it — making the pin button, which
        lives IN that title bar, unreachable by hover. The one control the whole
        mode exists for could only be hit before the grace period expired.

        addEventListener rather than JSX props because the element belongs to
        the popover primitive. No removal: it is discarded with the popover.
      */
```


## § src/autoHide.tsx:886

*The flyout's OWN title bar.*

HEAD `src/autoHide.tsx:886` — 100 words. Attached to: `}`

```text
/*
        The flyout's OWN title bar.

        It carries the same classes as a docked column's, deliberately: pinning
        changes where the panel lives, not what it looks like, and a flyout that
        restyled itself on promotion would read as a different panel appearing.

        It has to exist here because the panel's real `.acc-col-bar` lives in the
        docked shell, which `autoHide.css` takes out of the layout while the panel
        floats. Before this, a flyout had no pin — the one control the entire mode
        is about — and no close either; the only route to pinning was the rail
        button's context menu, which nothing advertises.
      */
```


## § src/autoHide.tsx:965

*Render a panel's subtree into WHICHEVER surface currently owns it — its*

HEAD `src/autoHide.tsx:965` — 210 words. Attached to: `/**`

```text
/**
 * Render a panel's subtree into WHICHEVER surface currently owns it — its
 * flyout, its tear-off window, or its column — without ever rebuilding it.
 *
 * ONE `<Portal>`, whose `mount` is resolved from `mounts` in priority order and
 * falls back to a host element sitting where the panel declares it. Verified in
 * solid-js 1.9.12 (see the header of `tearOff.tsx` for the source walk): Portal
 * reads `mount` inside its effect and CACHES its children memo, so changing the
 * mount MOVES the existing nodes and reuses the existing reactive graph. Scroll
 * position, text selection, an in-flight edit and all component state survive
 * promote, demote, tear-off and dock.
 *
 * The alternative — a `<Show>` swapping an inline branch for a portalled one —
 * re-evaluates the children and throws all of that away on every transition.
 * That is the same reasoning that governs the panel's keep-mounted-while-
 * collapsed rule, applied one level up.
 *
 * SUPERSEDES `TearOffOutlet` in `tearOff.tsx`: this is the same mechanism
 * generalised from one alternate surface to N. Pass tear-off's `mountFor` as
 * one entry in `mounts`.
 *
 * COST, stated plainly: two wrapper elements appear in the panel's DOM. Both are
 * `display: contents` while docked so they add no box and no layout, but they DO
 * sit in the selector chain — the two `.acc-content > .acc-group` rules in
 * styles.css need widening. See the handoff.
 */
```


---

# src/Breadcrumb.tsx


## § src/Breadcrumb.tsx:24

*The path across the open columns, for the Miller-column use of the dock:*

HEAD `src/Breadcrumb.tsx:24` — 105 words. Attached to: `/** Default separator glyph. `›` rather than `/` or `>` because the dock's chrome`

```text
/**
 * The path across the open columns, for the Miller-column use of the dock:
 * `src › components › AppShell.tsx`. Clicking a crumb truncates the chain.
 *
 * It owns NO open state. Everything it draws comes from `buildCrumbPath`, which
 * is a pure read of `visualOpenIds()` + `meta()`; everything it does goes back
 * through `setOpen` / the consumer's `onTruncate`. A breadcrumb that cached what
 * was open would be a second source of truth about the dock, and the first thing
 * it would do is disagree with the columns next to it.
 *
 * The only local state is presentational: which crumb holds the roving tab stop,
 * and whether the user has expanded an elided middle.
 */
```


## § src/Breadcrumb.tsx:113

*Identity of the current path, used only to decide when an expansion the user*

HEAD `src/Breadcrumb.tsx:113` — 129 words. Attached to: `const pathKey = createMemo<string>(() => path().map((c) => c.id).join('\0'));`

```text
/** Identity of the current path, used only to decide when an expansion the user
   *  asked for has been answered by the path itself changing.
   *
   *  NUL is the delimiter because no panel id can contain one, so two different
   *  paths can never join into the same key.
   *
   *  It MUST be written as the escape sequence and never as a raw byte. A literal
   *  NUL sat in this line until 2026-07-24, and one such byte makes `file(1)`
   *  report the whole module as `data` — at which point grep skips it as binary,
   *  silently and with no error. Every code search, audit sweep and `grep -r` in
   *  this repo was blind to this file for as long as that byte was there, which
   *  is exactly how a dead-code sweep reported its classes unused. */
```


## § src/Breadcrumb.tsx:150

*Focusable elements by key, for arrow-key movement.*

HEAD `src/Breadcrumb.tsx:150` — 106 words. Attached to: `const els = new Map<string, HTMLElement>();`

```text
/**
   * Focusable elements by key, for arrow-key movement.
   *
   * Through the shared slot rather than a bare `els.set`: a ref that only ever adds
   * keeps a detached node alive for every crumb the path has ever held, and
   * `focusAt` would then move focus into something no longer in the document.
   *
   * This file had its own correct implementation of that — identity-guarded clear
   * and all — while the GROUP had an unguarded one, and the group's is where the
   * orientation-swap bug lived. Two implementations of one contract, one of them
   * right, is the same hazard as none: whichever a new callsite copies decides
   * whether it is correct. Now there is one.
   */
```


---

# src/breadcrumbPath.ts


## § src/breadcrumbPath.ts:94

*Fired BEFORE the truncation is applied, with every id that is about to be*

HEAD `src/breadcrumbPath.ts:94` — 115 words. Attached to: `onTruncate?: (closedIds: readonly string[], crumb: CrumbData) => void;`

```text
/**
   * Fired BEFORE the truncation is applied, with every id that is about to be
   * closed and the crumb that was clicked.
   *
   * This is not a notification — for a Miller browser it is REQUIRED wiring. A
   * `<AccordionLeaf>` is controlled: its `open` prop is the consumer's signal,
   * mirrored into the group by an effect. So the breadcrumb cannot close a leaf
   * by calling `setOpen` (see `applyTruncation`); the consumer has to clear the
   * selection that opened it, exactly as it already does for the leaf's own ×
   * button. Panels driven by a consumer effect (`setOpen('files', folder() !==
   * null)`) want the same treatment for the same reason — the group would close
   * them, but the consumer's selection state would still claim otherwise.
   */
```


## § src/breadcrumbPath.ts:143

*Close everything after `index`.*

HEAD `src/breadcrumbPath.ts:143` — 215 words. Attached to: `function applyTruncation(`

```text
/**
 * Close everything after `index`.
 *
 * PINNED PANELS ARE CLOSED TOO. That is a deliberate choice against the other
 * plausible reading, so the rule it follows is worth stating in full:
 *
 *   The pin exempts a panel from AUTOMATIC collapse, not from an EXPLICIT close.
 *
 * `single`-policy auto-collapse and `collapseAll()` are both things that happen
 * to a panel as a side effect of an action aimed somewhere else — "I opened
 * another panel", "I pressed Collapse All". The pin is protection from collateral
 * damage, and it is why those two spare it.
 *
 * A crumb click is not collateral. The user pointed at a position in the path and
 * said "it ends here"; every column after it is precisely the subject of the
 * action, not a bystander. Sparing a pinned one would leave the bar reading `src
 * › components › Search` immediately after the user clicked `components` — a
 * breadcrumb that contradicts the click that produced it is worse than a pin that
 * did not hold.
 *
 * This also matches what the control already does: `AccordionPanel`'s own × calls
 * `setOpen(id, false)` with no pin check, so an explicit close has never
 * respected the pin. The breadcrumb is a contiguous run of exactly that close.
 *
 * The pin STATE survives — `togglePin` is never called here — so reopening the
 * panel brings its pin back and it resumes surviving auto-collapse.
 */
```


---

# src/contentSize.ts


## § src/contentSize.ts:1

*`defaultSize="content"` — size a column to what it actually holds, ONCE.*

HEAD `src/contentSize.ts:1` — 206 words. Attached to: `import { createEffect } from 'solid-js';`

```text
/**
 * `defaultSize="content"` — size a column to what it actually holds, ONCE.
 *
 * ── Why measure-and-freeze rather than a live `max-content` column ───────────
 * A CSS `width: max-content` column tracks its content forever, which sounds
 * like the same feature and is not: in a dock whose columns hold live numbers, a
 * P/L crossing a digit boundary (`$9.99` → `$10.01`) re-resolves the track and
 * the whole column — and every column after it — twitches sideways. The column
 * is also no longer draggable in any meaningful sense, because the next render
 * throws the user's width away.
 *
 * So this measures the natural width at the moment a panel first opens with no
 * size of its own, commits it through `setSize`, and then gets out of the way.
 * From that point the column is an ordinary explicit size: draggable, persisted,
 * and never measured again.
 *
 * ── Why the frozen width carries digit slack ────────────────────────────────
 * Freezing has one failure mode, and it is the same digit boundary: a column
 * frozen around `$9.99` compresses (or clips) the moment the number becomes
 * `$10.01`. The slack is therefore not padding-for-looks — it is the cost of
 * freezing, and it is derived from the content's OWN font so it scales with the
 * type scale instead of being a px fudge that is right at exactly one size.
 */
```


## § src/contentSize.ts:91

*The element's natural extent along one axis, in px.*

HEAD `src/contentSize.ts:91` — 154 words. Attached to: `function naturalExtentPx(el: HTMLElement, axis: 'width' | 'height'): number {`

```text
/**
 * The element's natural extent along one axis, in px.
 *
 * `scrollWidth` IS NOT THIS, and the difference is the whole reason this
 * function exists: `scrollWidth` reports the scrollable overflow, so it equals
 * `clientWidth` whenever the box is already at least as wide as its content —
 * i.e. it answers "how much does this overflow" when the question is "how wide
 * does this want to be". Measuring a column that is currently too WIDE with
 * `scrollWidth` returns the too-wide width and freezes the mistake.
 *
 * The element is therefore forced to its intrinsic size and read back. Both the
 * write and the restore happen inside one synchronous task, so the browser has
 * no opportunity to paint the intermediate state — the read forces a synchronous
 * reflow, not a visible frame. `flex` is neutralised alongside the size because
 * the host is a flex item, and a flex item's base size loses to the flex
 * algorithm before it ever reaches layout.
 */
```


## § src/contentSize.ts:180

*Seed a panel's opening size — the ONE implementation of the `defaultSize`*

HEAD `src/contentSize.ts:180` — 194 words. Attached to: `export function seedDefaultSize(input: {`

```text
/**
 * Seed a panel's opening size — the ONE implementation of the `defaultSize`
 * rule, consumed by both `AccordionPanel` and `AccordionLeaf`.
 *
 * Shared rather than written twice on purpose: this is the second rule in this
 * package to be seeded identically by those two components (the first, the
 * plain-number branch, WAS duplicated), and a rule with two implementations is
 * one edit away from a leaf and a panel disagreeing about when a size is
 * allowed to be overwritten.
 *
 * TIMING is the substance here, and the two branches genuinely differ:
 *
 *  - A NUMBER needs no layout, so it is seeded on mount — before first paint,
 *    which is what stops a column opening at the mode's automatic width and
 *    visibly snapping to its default.
 *  - `'content'` cannot be measured until the content has a box, which means
 *    the panel must be OPEN and laid out. It therefore waits for the first open
 *    and measures after paint. A closed panel's host is `hidden`, and hidden
 *    boxes measure zero.
 *
 * Both branches are one-shot in the same sense: they only ever act while the
 * panel has no size at all, so a persisted layout, a splitter drag, or an
 * earlier measurement all pre-empt them permanently.
 */
```


---

# src/context.ts


## § src/context.ts:139

*How the group ASKS a leaf to close. Present on leaves, absent on panels.*

HEAD `src/context.ts:139` — 134 words. Attached to: `requestClose?: () => void;`

```text
/**
   * How the group ASKS a leaf to close. Present on leaves, absent on panels.
   *
   * A leaf is CONTROLLED: its visibility is `props.open` on `<AccordionLeaf>`,
   * mirrored into the group by an effect that only re-runs when that prop changes.
   * So the group cannot close one by editing its own open list — the leaf would go
   * on painting while the group believed it closed, leaving a pane on screen with a
   * broken flex `order` and a splitter that no longer finds its neighbour.
   *
   * That hazard used to be prevented by COMMENTS at the two callsites that knew
   * about it (the breadcrumb's truncation skipped leaves explicitly), which is the
   * shape of bug this codebase keeps finding: a rule enforced by remembering.
   * `setOpen(leafId, false)` now routes here instead, so the desync is not
   * something a caller can cause.
   */
```


## § src/context.ts:373

*The element that currently REPRESENTS this panel in the chrome, reactively.*

HEAD `src/context.ts:373` — 158 words. Attached to: `activatorElOf: (id: string) => HTMLElement | undefined;`

```text
/**
   * The element that currently REPRESENTS this panel in the chrome, reactively.
   *
   * Normally the panel's own activator: the vertical header, or the rail button.
   * When the rail overflowed and this panel's button was collapsed into the `⋯`
   * menu, it is that TRIGGER instead — because the trigger is where the panel now
   * lives as far as the user is concerned, and it is the only element on screen a
   * flyout can sensibly emerge from or focus can sensibly return to.
   *
   * Every consumer wants that fallback, which is why it is resolved here rather
   * than at each callsite: an anchored flyout, `moveFocus`, and the focus-restore
   * on dismiss would each otherwise have to know about rail overflow.
   *
   * Reactive because a flyout resolves it during render, before the ref has fired,
   * and because overflow re-partitions the rail as the dock is resized.
   *
   * Returns `undefined` only when the panel has no on-screen representation at all
   * (unregistered, or a leaf — leaves have no activator by definition).
   */
```


## § src/context.ts:429

*A `ref` callback that fills a slot and empties it on unmount.*

HEAD `src/context.ts:429` — 243 words. Attached to: `export function slotRef<T extends HTMLElement>(`

```text
/**
 * A `ref` callback that fills a slot and empties it on unmount.
 *
 * TWO DEFECTS THIS EXISTS TO REMOVE, both invisible to tsc and to any test that
 * does not look at the DOM afterwards.
 *
 * 1. NOTHING EVER CLEARED. Solid invokes `ref={(el) => …}` exactly once, when the
 *    element is created; there is no second call on unmount. So the obvious
 *    spelling registers an element and then keeps it FOREVER, including after it
 *    has left the document. A detached node reports a zero-size rect at the origin
 *    and swallows `.focus()` — so a flyout anchored to one opened in the corner of
 *    the viewport, `moveFocus` moved focus nowhere, and `resize` seeded a panel's
 *    extent as 0.
 *
 * 2. A CLEAR THAT COULD NOT IDENTIFY ITSELF. Fixing (1) with `clear(key)` produced
 *    a second, quieter bug: when one element replaces another for the same key, the
 *    OUTGOING element's cleanup can run after the incoming one has registered, and
 *    an unconditional clear then deletes the live element.
 *
 *    That is not hypothetical — it is what a vertical→horizontal orientation swap
 *    did. The rail button mounts and registers, the vertical header unmounts and
 *    clears, and the panel is left with no activator at all: `activatorElOf`
 *    returned undefined, so the flyout had no anchor and the keyboard had no
 *    target. (The opposite direction happened to interleave the other way and
 *    worked, which is how it stayed hidden.)
 *
 * Passing the element to `clear` makes the guard something the slot performs rather
 * than something each caller remembers.
 */
```


## § src/context.ts:465

*A throwing cleanup is not a local failure. Solid unwinds an owner tree by*

HEAD `src/context.ts:465` — 144 words. Attached to: `try {`

```text
/*
       * A throwing cleanup is not a local failure. Solid unwinds an owner tree by
       * walking its cleanups, and an exception in ONE of them abandons the walk —
       * every cleanup that had not run yet is skipped, silently.
       *
       * That is not hypothetical either: an earlier version of this helper read an
       * id off a `<Show>`-provided prop during teardown, threw a TypeError, and the
       * abandoned cleanups included the tear-off controller's. The visible result
       * was that navigating away from the dock left its popped-out OS WINDOWS open,
       * orphaned, with no opener to close them — a leak two layers from the line
       * that threw, reported as nothing at all.
       *
       * The root fix is that a slot's `clear` must not read reactive state (it is
       * handed everything it needs). This is the guard that keeps a future
       * violation local instead of taking down every other cleanup in the tree.
       */
```


---

# src/gesture.ts


## § src/gesture.ts:1

*Two pointer-gesture helpers the RAIL PAN owns.*

HEAD `src/gesture.ts:1` — 172 words. Attached to: `/**`

```text
/**
 * Two pointer-gesture helpers the RAIL PAN owns.
 *
 * ── Why these are here and not imported ─────────────────────────────────────
 * They arrived as part of a vendored copy of `@cujuju/solid-reorder-list`, which
 * this package now depends on for real (see `AccordionGroup`). The reorder
 * primitive itself came back as the dependency; these two did NOT, because they
 * are not part of that library's public surface — its `index.ts` exports only
 * `createReorderList`, `createReorderGrid`, `DEFAULT_SKIP_SELECTOR` and their
 * types, and its `exports` map admits no subpath, so `.../src/shared` cannot be
 * deep-imported past it.
 *
 * So the choice was: reach around a package's declared API, or own the twenty
 * lines. Owning them is the smaller lie. They are consumed by `railPan.ts` — the
 * dock's OWN pan gesture, which is not a reorder and would need this behaviour
 * even if the reorder library did not exist.
 *
 * NOT a fork, and nothing here tracks upstream: if the library ever exports them,
 * delete this file and import them. Until then this is dock code.
 *
 * Original implementation © the `@cujuju/solid-reorder-list` author (same author
 * as this package), reused here with the same intent.
 */
```


---

# src/icons.tsx


## § src/icons.tsx:12

*── The pin, and why it is TWO glyphs rather than one rotated ───────────────*

HEAD `src/icons.tsx:12` — 206 words. Attached to: `/** Lucide `pin` — the PINNED state. */`

```text
/*
 * ── The pin, and why it is TWO glyphs rather than one rotated ───────────────
 *
 * Path data is Lucide's `pin` and `pin-off` (lucide-solid v1.24.0, ISC —
 * https://lucide.dev), inlined verbatim rather than imported: this package ships
 * dependency-free chrome, and pulling an icon set in for two glyphs would put a
 * dependency in every consumer's tree for 6 path strings.
 *
 * The previous glyph was hand-plotted and did not read as a pushpin at 13px. It
 * expressed "unpinned" by CSS-rotating itself 45°, which was a reasonable trick
 * for a shape with no unpinned variant, and is the wrong one here for two
 * reasons: Lucide's pin has a straight vertical shaft (`M12 17v5`) whose whole
 * legibility comes from being vertical, so rotating it reads as an icon knocked
 * askew rather than as a state; and Lucide already ships the negated glyph, where
 * the slash is its established idiom for "not this". Two glyphs also make the
 * state legible while the control is at rest, which a rotation only manages if
 * you know what the un-rotated one looks like.
 *
 * Kept at Lucide's own geometry — 24 viewBox, `stroke-width: 2`, round caps and
 * joins — because that is what makes it look like the rest of the icon set at
 * any size; the dock scales it with `--acc-pin-size`.
 */
```


---

# src/index.ts


## § src/index.ts:1

*Every stylesheet the control needs, imported HERE and nowhere else — this*

HEAD `src/index.ts:1` — 123 words. Attached to: `import './styles.css';`

```text
/*
 * Every stylesheet the control needs, imported HERE and nowhere else — this
 * module is the only entry point, so a file missing from this list has simply
 * never been loaded by anything.
 *
 * `autoHide.css` and `rail.css` were absent until 2026-07-24: both were written,
 * both were correct, and neither had ever reached a browser. Auto-hide flyouts
 * therefore kept their docked column in the layout (the panel's `display: none`
 * lived in the unloaded file), and the rail's overflow strategies never applied,
 * so it fell back to a scrollbar in a 40px strip. Nothing failed loudly, because
 * a missing stylesheet has no error state — it just looks like a layout bug.
 *
 * Order is deliberate: `styles.css` first, so the opt-in modes that follow can
 * override it at equal specificity.
 */
```


---

# src/keys.ts


## § src/keys.ts:3

*Roving keyboard nav for a panel's activator — the stacked header in `vertical`*

HEAD `src/keys.ts:3` — 126 words. Attached to: `export function createActivatorKeyDown(`

```text
/**
 * Roving keyboard nav for a panel's activator — the stacked header in `vertical`,
 * the rail button in `horizontal`. ONE implementation for both, because the two
 * activators are the same control wearing different chrome, and letting them drift
 * is how you end up with a dock where Home works on one axis only.
 *
 * Arrow keys are what make a stack of headers feel like ONE control rather than N
 * buttons that happen to be adjacent: without them, traversing a 6-panel dock costs
 * 6 tabs and drops you into the content between each.
 *
 * The nav axis is ALWAYS the axis the activators are stacked along — which is
 * vertical in both orientations (headers stack down; rail buttons stack down). So
 * Up/Down always moves between panels, and Left/Right always means collapse/expand.
 */
```


## § src/keys.ts:35

*Shift+F10 and the dedicated ContextMenu key, handled EXPLICITLY.*

HEAD `src/keys.ts:35` — 116 words. Attached to: `if (options?.onMenu !== undefined && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {`

```text
/*
     * Shift+F10 and the dedicated ContextMenu key, handled EXPLICITLY.
     *
     * Not because the menu was unreachable — a review claim that turned out to be
     * wrong. Chromium and Firefox synthesise a `contextmenu` EVENT for both keys,
     * which the activator's existing `onContextMenu` already caught; verified by
     * disabling this branch and watching the browser tests still pass.
     *
     * It is kept because that synthesis is a platform courtesy rather than a
     * guarantee — macOS has no ContextMenu key at all and Shift+F10 is not a Safari
     * binding — and because a synthesised event carries whatever coordinates the
     * browser picks, while `openAtElement` anchors the menu to the activator. So
     * this makes a behaviour that happens to work everywhere we tested into one
     * that is specified.
     */
```


---

# src/leafChain.ts


## § src/leafChain.ts:4

*The parent→child structure of a LEAF CHAIN: file → symbol → reference.*

HEAD `src/leafChain.ts:4` — 319 words. Attached to: `/**`

```text
/**
 * The parent→child structure of a LEAF CHAIN: file → symbol → reference.
 *
 * A leaf is still terminal in every way that matters to the rail (no button, not
 * reorderable, exempt from auto-collapse). What it gains here is the ability to be
 * a WAYPOINT: selecting something inside leaf A opens leaf B to its side, and both
 * stay leaves. That needs exactly one fact the group does not already hold —
 * "whose child is this?" — and this file is where that fact lives.
 *
 * WHY A SEPARATE REGISTRY RATHER THAN A `PanelMeta.parentId` FIELD
 *
 * `PanelMeta` is the honest long-term home: `parentId` is registration metadata,
 * exactly like `isLeaf`. It is not here because of a design argument, it is here
 * because `context.ts` and `AccordionGroup.tsx` are being edited concurrently by
 * another author, and widening a shared interface across that boundary is how two
 * correct changes produce one broken merge. The migration is mechanical and is
 * written up in this phase's handoff — nothing below depends on the registry
 * being a WeakMap rather than a field.
 *
 * WHY THE ORDER CANNOT COME FROM THE OPEN LIST
 *
 * Today `visualOpenIds` appends leaves in open-list order, which happens to be
 * chain order in the common case — a child can only be opened by a selection made
 * in its parent, so the parent got there first. "Happens to be" is the problem.
 * That coincidence holds only while a set of invariants nobody enforces all hold
 * at once: every close cascades, JSX declaration order matches chain order, and a
 * persisted open list round-trips unmodified. Break any one — reopen a parent
 * while a child is still open and the list reads `[child, parent]` — and the
 * columns silently paint backwards. Worse, `visualOpenIds` also feeds
 * `neighborOpenId` (which column a splitter resizes against) and the breadcrumb
 * path, so a wrong order is not merely cosmetic.
 *
 * A declared parent cannot drift. It is derived from a prop the author wrote, so
 * the order is a fact rather than a consequence.
 */
```


## § src/leafChain.ts:118

*Depth-first preorder over the open leaves, roots first.*

HEAD `src/leafChain.ts:118` — 124 words. Attached to: `const orderOpen = (openLeafIds: readonly string[]): string[] => {`

```text
/**
   * Depth-first preorder over the open leaves, roots first.
   *
   * Preorder rather than a depth sort, because a depth sort interleaves
   * independent chains: two chains X0→X1 and Y0 would paint X0, Y0, X1, splitting
   * X's columns around Y's. Preorder keeps every chain CONTIGUOUS, which is what
   * "paints in chain order" has to mean once more than one chain can be open.
   *
   * A leaf is a ROOT here when its declared parent is not itself an open leaf.
   * That deliberately covers three cases with one test: no parent declared, a
   * parent that is a PANEL rather than a leaf (a legitimate and useful link — see
   * `AccordionLeafProps.parentId`), and a parent that is closed or unregistered.
   * All three mean the same thing for layout: nothing open precedes this leaf.
   */
```


## § src/leafChain.ts:190

*The group's chain, for a leaf to write its link into.*

HEAD `src/leafChain.ts:190` — 143 words. Attached to: `export function leafChainFor(group: AccordionGroupApi): LeafChain {`

```text
/**
 * The group's chain, for a leaf to write its link into.
 *
 * Falls back to a private, unshared chain when the group has not been wired yet,
 * rather than throwing. The reasoning is about failure SHAPE: cascade-close and
 * the render gate are computed from props and `isOpen`, so they are correct with
 * or without the registry. Only the leaf ORDER degrades — back to exactly the
 * open-list order the control shipped with. Throwing would take a working
 * single-leaf dock down over a feature it does not use; the old behaviour plus a
 * warning is the proportionate failure.
 *
 * The warning is deferred to the first actual `link()` rather than raised here,
 * because "unwired" only MATTERS once something is chained. Every existing dock
 * calls this function for leaves that declare no parent, and warning those would
 * train the reader to ignore the message that does mean something.
 */
```


---

# src/panelMenu.tsx


## § src/panelMenu.tsx:10

*The right-click menu for a*

HEAD `src/panelMenu.tsx:10` — 138 words. Attached to: `/**`

```text
/**
 * The right-click menu for a
 * panel's ACTIVATOR: the rail button in `horizontal`, the header bar in
 * `vertical`, and the column title bar in `horizontal`.
 *
 * Two deliberate non-goals, because they are the usual way a control like this
 * grows a second personality:
 *
 * 1. It renders NO menu chrome of its own. Positioning, top-layer promotion,
 *    outside-click and Escape dismissal, submenu flyouts and viewport clamping
 *    all belong to `@cujuju/solidjs-context-menu`, which already solves them and
 *    is already a dependency here. A hand-rolled menu inside the accordion would
 *    be a second implementation of dismissal semantics that drifts from the
 *    first one the moment either is touched.
 * 2. It holds NO state. Every row's label, enablement and action is derived from
 *    `AccordionGroupApi` at read time, so the menu cannot disagree with the dock
 *    it is describing. The only local state is the click point.
 */
```


## § src/panelMenu.tsx:85

*Open panels that a BULK close is allowed to touch: open, not pinned, not a*

HEAD `src/panelMenu.tsx:85` — 119 words. Attached to: `function bulkClosableIds(group: AccordionGroupApi): readonly string[] {`

```text
/**
 * Open panels that a BULK close is allowed to touch: open, not pinned, not a
 * leaf.
 *
 * Both exemptions are the group's own rules, not this menu's, and both are worth
 * stating out loud:
 *
 * - PINNED is the entire point of the pin in this control. `collapseAll` spares
 *   pinned panels, so "Close All" from the menu must spare exactly the same set
 *   or the pin would mean two different things depending on which affordance the
 *   user reached for.
 * - LEAVES have no activator and are the RESULT of a selection made in the
 *   columns (see `PanelMeta.isLeaf`). `setOpen` already exempts them from
 *   single-policy auto-collapse for that reason; a bulk close that swept them
 *   away would discard the thing the user's last click produced.
 */
```


## § src/panelMenu.tsx:140

*Build the menu entries for one panel, from live group state.*

HEAD `src/panelMenu.tsx:140` — 149 words. Attached to: `export function buildPanelMenuItems(`

```text
/**
 * Build the menu entries for one panel, from live group state.
 *
 * Pure and DOM-free on purpose: it takes an `AccordionGroupApi` and an id and
 * returns plain data, so the enable/disable matrix — which is where the real
 * behaviour lives — is unit-testable against a hand-built stub API with no
 * renderer, no menu package and no jsdom.
 *
 * The hide-vs-disable rule used throughout, stated once: a row is HIDDEN only
 * when the capability does not exist for this panel at all (a non-pinnable panel
 * can never be pinned), and DISABLED when the capability exists but the current
 * state makes it a no-op (an already-closed panel). Hiding a state-blocked row
 * would make the menu change shape between openings and would hide the
 * capability itself, which is how a user concludes a feature is missing.
 *
 * Every enabled row does something observable. There are no rows here that run
 * an action the group will silently drop.
 */
```


---

# src/railOverflow.ts


## § src/railOverflow.ts:4

*Deciding which rail buttons FIT, so the ones that do not can collapse into a*

HEAD `src/railOverflow.ts:4` — 171 words. Attached to: `/**`

```text
/**
 * Deciding which rail buttons FIT, so the ones that do not can collapse into a
 * `⋯` menu instead of summoning a scrollbar into a 40px strip.
 *
 * WHY THIS IS NOT JUST `scrollHeight > clientHeight`
 *
 * The naive version of this feature measures the rail, hides the tail, and then
 * re-measures — at which point the rail no longer overflows, so the tail comes
 * back, so it overflows again. That flicker loop is the entire difficulty of an
 * overflow menu, and it is structural: the measurement's input depends on the
 * decision the measurement produces.
 *
 * The fix here is to break that dependency rather than damp it. Measurement only
 * ever happens during a MEASURE PASS, in which every button is rendered (see
 * `measuring`); the fit decision is then a pure function of inputs that no longer
 * move — each button's own extent, the rail's extent, and the trigger's extent.
 * Hiding buttons cannot change any of those three, so the decision cannot feed
 * back into its own inputs. Convergence is not a tuning problem; there is nothing
 * to tune.
 */
```


## § src/railOverflow.ts:39

*Everything in the rail that is a CONTROL rather than background, as a selector*

HEAD `src/railOverflow.ts:39` — 120 words. Attached to: `export const RAIL_CONTROL_SELECTOR = `[${RAIL_ITEM_ATTR}], [${RAIL_OVERFLOW_ATTR}]`;`

```text
/**
 * Everything in the rail that is a CONTROL rather than background, as a selector.
 *
 * Built from the two constants above rather than written out, because it is
 * consumed by a different module (`railPan`, to tell a press on a button from a
 * press on bare rail) and that module used to spell the attributes as literals.
 * Nothing would have failed if the two spellings drifted: `closest()` would simply
 * return null for every press, every bare left-drag on a rail button would be read
 * as a pan, and the capture-phase `stopPropagation` that makes panning work would
 * have silently killed drag-reorder. Exported as a finished selector so there is
 * one place the answer to "is this a rail control" is written down.
 */
```


---

# src/railPan.ts


## § src/railPan.ts:6

*Drag-to-pan for the rail, coexisting with drag-to-reorder.*

HEAD `src/railPan.ts:6` — 180 words. Attached to: `/** Secondary/middle pointer button, per the UI Events `button` enumeration. */`

```text
/**
 * Drag-to-pan for the rail, coexisting with drag-to-reorder.
 *
 * THE COLLISION, AND HOW IT IS RESOLVED
 *
 * `createReorderList` already owns the bare left-button drag on a rail button.
 * Reorder is available always; panning only means anything once the rail
 * overflows. The always-available gesture therefore keeps the unmodified drag,
 * and pan takes the modified ones. (Team-lead call, recorded here so the next
 * reader does not relitigate it from the code.)
 *
 * Three entry points, and each is unambiguous for a different reason:
 *
 *   1. MIDDLE-BUTTON drag, anywhere in the rail. Costs nothing to allow, because
 *      `createReorderList` returns early on `e.button !== 0` — it never sees a
 *      middle-button press, so there is no contention to arbitrate.
 *   2. SPACE-held + left drag, anywhere in the rail. This one genuinely collides,
 *      and is resolved in the capture phase — see `onPointerDownCapture`.
 *   3. Bare left drag on rail BACKGROUND (not on a button). No reorder gesture
 *      exists there — `itemProps` are attached per-button — so the unmodified
 *      drag is free.
 *
 * Everything about click and reorder suppression reuses the vendored primitive's
 * own helpers rather than reimplementing them, so the two gestures cannot drift
 * apart in feel.
 */
```


## § src/railPan.ts:85

*Space is the modifier AND the activation key for a focused button, which is a*

HEAD `src/railPan.ts:85` — 106 words. Attached to: `const focusInsideRail = (): boolean => {`

```text
/**
   * Space is the modifier AND the activation key for a focused button, which is a
   * real conflict rather than a theoretical one: a keyboard user on a rail button
   * presses Space to open the panel.
   *
   * It is resolved by narrowing when Space is claimed, not by choosing a winner.
   * Space arms a pan only when the POINTER is over the rail (so the user is in a
   * mouse gesture), the rail actually scrolls (so panning means something), and
   * focus is NOT inside the rail (so no button is waiting for that keypress).
   * Outside that intersection Space keeps every default it has — page scroll,
   * button activation — untouched.
   */
```


---

# src/resize.ts


## § src/resize.ts:4

*Splitter drag engine.*

HEAD `src/resize.ts:4` — 264 words. Attached to: `/**`

```text
/**
 * Splitter drag engine.
 *
 * The model is deliberately CONSERVATIVE: a drag moves the boundary between exactly
 * two adjacent open panels, adding to one and taking the same amount from the other.
 * The group's total extent never changes, so a resize cannot make the dock overflow
 * its container or leave a gap — the two failure modes of the naive "just set this
 * panel's width" approach.
 *
 * Sizes are seeded from the DOM at gesture start rather than tracked continuously:
 * before the first drag every panel is sized by the mode (`fill` splits evenly,
 * `natural` uses a token width), and those computed sizes are exactly what the user
 * sees and expects to start dragging FROM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREVIEW vs COMMIT — a gesture is ONE decision, not sixty.
 *
 * A pointermove is not a decision the user made; releasing the pointer is. The
 * engine therefore writes intermediate sizes through `previewSizes` (signal only)
 * and the settled one through `commitSizes` (persisted, and reported to the
 * consumer). Everything the user sees during a drag comes from the preview, so the
 * feel is identical.
 *
 * It used to call one setter for both, which meant a `JSON.stringify` plus a
 * synchronous `localStorage.setItem` on EVERY pointermove — a write per frame for
 * the whole gesture, of which exactly one was worth keeping — and one
 * `onSizeChange` per frame for a consumer that almost certainly wanted the result.
 * The intermediate values are not merely wasteful to store, they are wrong to
 * store: a drag interrupted by a crash would persist whatever pixel the pointer
 * happened to be over, and a consumer mirroring the callback would record sixty
 * layout revisions for one adjustment.
 */
```


## § src/resize.ts:76

*The flex declaration for ONE open member, given its explicit size (if any).*

HEAD `src/resize.ts:76` — 813 words. Attached to: `export function columnFlex(opts: {`

```text
/**
 * The flex declaration for ONE open member, given its explicit size (if any).
 *
 * ONE definition for both `<AccordionPanel>` and `<AccordionLeaf>`: the leaf is a
 * first-class member for sizing, so two copies of this rule would be two places to
 * forget the surplus case below — which is exactly how the dead gap got shipped.
 *
 * ── The surplus has to go somewhere ─────────────────────────────────────────
 * `fill` mode means "the dock has this extent and divides ALL of it". An explicit
 * size (from a splitter drag, a `defaultSize`, or a persisted layout) turns a
 * member into `flex: 0 0 Npx`, and once EVERY open member is explicitly sized
 * nothing is left to absorb the remainder — the group paints a dead strip at its
 * trailing edge and the mode has quietly stopped meaning what it says.
 *
 * ── Who absorbs it: DECLARED first, trailing by default ─────────────────────
 * Which member *should* take the surplus is a question about the CONTENT, and only
 * the CONSUMER can answer it. Resist the temptation to infer it from a member's
 * role — "the list grows, the detail pane is bounded" is the obvious-sounding rule
 * and it is wrong. A detail pane is not reliably short: a symbol's strategies run
 * one card per expiration and every card carries its legs, so the pane is often
 * the TALLER of the two. Neither kind of member is dependably bounded, which is
 * exactly why this is a declaration (`grow`) and not a heuristic.
 *
 * The DEFAULT, when nobody declares, stays the trailing member. That was once
 * justified as the rule rather than a fallback, on the grounds that the trailing
 * member is the one whose size the user cannot drag directly — splitters sit on a
 * member's edge FACING THE NEXT one, so the last has no handle of its own and any
 * size it carries is a leftover of resizing its neighbours, never a size the user
 * asked for. That reasoning is still true, and it is still why trailing is a SAFE
 * default. It is not a reason to think trailing is the RIGHT recipient: it was
 * chosen for a horizontal dock where the trailing column was the surface — the
 * thing that wanted all the room — and the same rule rotated into a vertical
 * sidebar hands the surplus to the detail pane, which is precisely the member that
 * cannot use it.
 *
 * TWO OR MORE DECLARED GROWERS SHARE the remainder. Each keeps its own size as its
 * basis and they take equal `flex-grow`, so the SURPLUS is split evenly between
 * them while their starting sizes stay different — not a 50/50 split of the group.
 * This is a first-class configuration, not a tolerated mistake: when two sections
 * both hold content of unpredictable length, "share what is left and let each
 * scroll past its share" is the honest answer, and picking a winner would starve
 * whichever one the consumer did not name.
 *
 * The stored px stays as the flex BASIS rather than being discarded, so a growing
 * member still starts from its remembered size when the group is too small to
 * grant the remainder, and shrinks from there like any other.
 *
 * ── `shrinkToContent`: the stored size as a CEILING, not an extent ───────────
 * The two behaviours above both answer "how do we spend space the members do not
 * individually want". A member can instead declare that it never wants more room
 * than its content occupies — a list that is exactly as tall as its rows, and no
 * taller, with the sidebar's leftover space simply left empty.
 *
 * That reading needs no new sizing machinery, because CSS already has it: a
 * content basis (`flex: 0 1 auto`) with the stored size applied as a `max-*`. The
 * member is then its content when short, its stored size when long, and scrolls
 * internally past that — which is the whole rule in one declaration rather than a
 * mode with branches. `flex-shrink` stays 1 so several such members still divide a
 * group too small for all of them instead of overflowing it.
 *
 * The stored size becoming a CEILING has a consequence worth stating: dragging the
 * splitter to make such a member BIGGER than its content does nothing visible,
 * because the content is still where the box ends. The drag is not lost — it has
 * raised the ceiling, and the extra room appears the moment the content reaches
 * it. Dragging SMALLER is immediate, since that is the ceiling biting.
 *
 * It follows that seeding one of these from `defaultSize: 'content'` is
 * self-defeating: a ceiling measured from the content is a ceiling the content is
 * already touching, so the member could never grow again and would be frozen at
 * whatever it happened to hold when it first opened. Leave such a member unsized
 * and let the ceiling come from a deliberate drag.
 *
 * `shrinkToContent` and `grow` are contradictory — one never exceeds its content,
 * the other exists to exceed it — so `shrinkToContent` wins and the declaration is
 * ignored rather than producing a member that both does and does not absorb.
 */
```


## § src/resize.ts:237

*Move the boundary on `id`'s trailing edge by `steps` — the KEYBOARD path.*

HEAD `src/resize.ts:237` — 111 words. Attached to: `nudge: (id: string, steps: number, coarse: boolean) => void;`

```text
/**
   * Move the boundary on `id`'s trailing edge by `steps` — the KEYBOARD path.
   *
   * Not an accessibility afterthought bolted beside the drag: it redistributes
   * through the same clamped arithmetic, so the floors, the mirrored axis and the
   * "the pair always sums to the same total" invariant hold identically. A second
   * implementation of that arithmetic is how the two paths come to disagree about
   * what a minimum means.
   *
   * `steps` is signed the way a pointer would move. Collapse is deliberately NOT
   * reachable this way: overdrag is a gesture with a distance, and a keypress has
   * none, so a key can clamp at the minimum but never close a panel out from under
   * the user.
   */
```


## § src/resize.ts:348

*Applied from the first pixel — there is deliberately no activation*

HEAD `src/resize.ts:348` — 127 words. Attached to: `const raw = (now - startPointer) * host.direction();`

```text
/*
       * Applied from the first pixel — there is deliberately no activation
       * threshold.
       *
       * There used to be a constant for one, set to 0, guarded by
       * `Math.abs(raw) < 0` (never true) and commented as matching the reorder
       * primitive's activation distance. It matched nothing and did nothing. A
       * dead constant claiming to encode a decision is worse than no constant:
       * the next reader either trusts a threshold that is not there, or "fixes"
       * the value and silently changes behaviour nothing tested.
       *
       * The threshold is genuinely not wanted here. It exists in a reorder drag
       * to tell a click from a drag on an element that does BOTH. A splitter is a
       * dedicated handle with no click action, so a press that moves 2px means
       * "move the boundary 2px" and nothing else.
       */
```


---

# src/Splitter.tsx


## § src/Splitter.tsx:4

*The drag handle on a panel's TRAILING edge — the boundary between it and the n*

HEAD `src/Splitter.tsx:4` — 239 words. Attached to: `/** One arrow press. The engine owns the DISTANCE (see `KEYBOARD_STEP_PX` there), so`

```text
/**
 * The drag handle on a panel's TRAILING edge — the boundary between it and the next
 * open panel.
 *
 * It is rendered by the panel rather than as a standalone sibling because flex
 * `order` decides visual sequence here: a free-standing splitter element would have
 * to be given an order value interleaved with the columns', and every reorder or
 * open/close would have to re-thread them. Anchoring the handle to the panel it
 * resizes makes that bookkeeping disappear.
 *
 * Renders only when there IS a next open panel — a handle on the last column would
 * resize the group itself, which the group does not own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT IS A CONTROL, NOT DECORATION.
 *
 * This was a `role="separator"` with no `tabindex`, no key handler and no
 * `aria-value*`: resize was reachable by pointer only. `keys.ts` already states the
 * principle for the other gesture in this control — "drag-to-reorder that has no
 * keyboard equivalent is an accessibility hole, not a missing nicety: a
 * pointer-only affordance makes the feature unreachable rather than awkward" — and
 * reorder duly got Alt+Arrow while resize got nothing.
 *
 * So it is now a focusable window splitter per the ARIA pattern: arrows move the
 * boundary, Shift takes a coarse step, Home/End go to the panel's floor and
 * ceiling. The keys map to the AXIS the panels grow along, which is the axis the
 * handle visibly slides on — Left/Right between columns, Up/Down between stacked
 * panels — so the binding is the one the geometry suggests rather than one to learn.
 */
```


## § src/Splitter.tsx:51

*SUPPRESSED ON THE RAIL BOUNDARY.*

HEAD `src/Splitter.tsx:51` — 106 words. Attached to: `const shown = (): boolean =>`

```text
/**
   * SUPPRESSED ON THE RAIL BOUNDARY.
   *
   * The last pinned column's trailing edge is the rail, not another column. A
   * handle there would be a resizer whose "next panel" is on the far side of a
   * divider the user deliberately put between them — it would either drag the
   * rail around or resize a panel the user is not touching. The rail is a
   * boundary, so the boundary does not resize.
   *
   * `neighborOpenId` still answers with the next panel in painted order (the rail
   * is not a panel and never enters that sequence), which is exactly why this
   * needs its own check rather than falling out of the existing one.
   */
```


---

# src/styles.css


## § src/styles.css:1

*accordion-dock (MOCK) — Visual Studio style collapsible panel dock.*

HEAD `src/styles.css:1` — 265 words. Attached to: `@layer cujuju-defaults {`

```text
/* accordion-dock (MOCK) — Visual Studio style collapsible panel dock.

   Two orientations share one state machine:
     vertical   — headers stack down, panels grow downward (classic accordion)
     horizontal — collapsed panels are buttons in a left RAIL, open panels grow
                  out to the right as columns, in the order they were opened

   CASCADE LAYERS — read this before adding a rule, and before "matching" it
   elsewhere.

   ONLY THE TOKEN BLOCK IS LAYERED. `:root` and the density overrides sit in
   `@layer cujuju-defaults`, so a consumer restating `--acc-accent` unlayered wins
   without specificity games. Every COMPONENT rule in this file — `.acc-panel`,
   `.acc-header`, the lot — is deliberately UNLAYERED.

   `--_`-prefixed names are PRIVATE — derived, group-scoped, never a host input —
   so they are declared where they are derived, outside the layered `:root` block.

   That asymmetry is load-bearing, and the comment that used to sit here did not
   say so: it claimed defaults lived in a layer, full stop. A reader took it at its
   word and wrapped `autoHide.css` in the same layer to match — at which point
   every rule in that file silently lost, because an unlayered declaration beats a
   layered one OUTRIGHT, ahead of specificity. The visible result was a flying-out
   panel whose docked column was never removed from the layout: it kept its slot
   and painted its title bar over the flyout in front of it.

   So the rule for the sibling stylesheets (`autoHide.css`, `rail.css`,
   `breadcrumb.css`) is: tokens layered, component rules unlayered, exactly as
   here. That keeps them competing with this file on specificity and source order,
   which is what "imported after styles.css so the opt-in modes can override it"
   in `index.ts` actually depends on. */
```


## § src/styles.css:170

*Chrome transitions — header and rail-button backgrounds, the chevron's*

HEAD `src/styles.css:170` — 163 words. Attached to: `--acc-duration: 0ms;`

```text
/* Chrome transitions — header and rail-button backgrounds, the chevron's
       rotation, badge opacity. ZERO BY DEFAULT: these fire on every hover and
       every open, so any duration at all is a tax paid continuously on the
       control's most common interactions, and a dock reads as SNAPPY or it does
       not. The transitions themselves are left declared throughout rather than
       deleted — a 0ms transition is inert, so this is a value a consumer raises
       to opt INTO motion rather than a feature that has to be rebuilt.

       Was 140ms, on the reasoning that a colour fade at that length reads as
       "instant but soft". It does; it is also 140ms of softness in front of a
       click the user has already committed to. Motion here decorates a state
       change that is already unambiguous.

       This is deliberately NOT the same decision as `--acc-open-duration`
       below, which stays non-zero because it is gated behind the `animated`
       prop — an explicit opt-in, and zeroing it would make that prop a no-op. */
```


## § src/styles.css:205

*── Density ────────────────────────────────────────────────────────────*

HEAD `src/styles.css:205` — 155 words. Attached to: `/* `.acc-flyout-host` is included because a flyout is Portal'd to <body> and so`

```text
/* ── Density ────────────────────────────────────────────────────────────
     `comfortable` IS the :root block above — there is no rule for it, because a
     second block restating the same values is the duplication this token layer
     exists to avoid.

     `compact` is a pure TOKEN OVERRIDE: not one rule below is density-aware, so
     the whole variant is this block. Roughly a 0.78 scale on the chrome, with
     two deliberate exceptions called out inline.

     Declared on the GROUP, so it beats the inherited :root value regardless of
     layers (a declaration on the element always wins over inheritance) — while
     a consumer targeting `.acc-group` unlayered still beats this, which is the
     same contract the :root defaults carry.

     KNOWN LIMIT: density INHERITS into nested groups. A nested group that
     declares `comfortable` inside a `compact` parent stays compact, because
     undoing it would mean also declaring the comfortable scale on the group —
     which would break the `:root`-override contract for every consumer. Density
     is a whole-dock choice here, not a per-level one. */
```


## § src/styles.css:300

*RTL — `railSide` is PHYSICAL and must not flip.*

HEAD `src/styles.css:300` — 175 words. Attached to: `.acc-group[data-orientation='horizontal'][data-rail-side='left']:dir(rtl) {`

```text
/* RTL — `railSide` is PHYSICAL and must not flip.
   "Dock it on the right of my screen" is a statement about the screen, not about
   reading order: the consumer picked that edge because of what else is on the
   page. `flex-direction: row` is NOT physical though — it follows `direction`,
   so under RTL a plain `row` would put the rail on the RIGHT and `row-reverse`
   on the left, silently mirroring the dock.
   Inverting the two keywords under :dir(rtl) pins the rail back to the physical
   edge the consumer asked for. Everything downstream (flex `order`, the resize
   sign in resize.ts, the physical borders below) then sees the same geometry it
   sees in LTR, so no other rule needs an RTL branch.

   `:dir()` rather than `[dir='rtl']`: it reads the element's resolved
   directionality, so it also covers `dir="auto"` and a `dir` set on any
   ancestor. It cannot see a `direction: rtl` applied from CSS alone with no
   `dir` attribute — that is the documented way to do RTL wrong (HTML requires
   the attribute), and no selector in CSS can match it. */
```


## § src/styles.css:352

*ARBITRARY CONSUMER CHILDREN (a toolbar, a status strip — anything that is not *

HEAD `src/styles.css:352` — 109 words. Attached to: `.acc-group > *:not(.acc-panel):not(.acc-rail):not(.acc-filler) {`

```text
/* ARBITRARY CONSUMER CHILDREN (a toolbar, a status strip — anything that is not a
   panel, the rail or the filler).

   Panels carry an explicit flex `order` of 1..N so the user can drag them into a
   new sequence. That silently promoted every other child to the FRONT of the
   group, because an element with no `order` sits at 0 and 0 sorts before 1 — so a
   toolbar declared last in the markup jumped above the first panel.

   The rule is: unordered content keeps its authored position relative to the
   panels, which means "after them". Just below the filler, so the filler still
   soaks up the slack at the very end. */
```


## § src/styles.css:453

*THE RAIL BUTTON IS SQUARE, ALWAYS — stated, never inherited. The buttons are a*

HEAD `src/styles.css:453` — 129 words. Attached to: `border-radius: 0;`

```text
/* THE RAIL BUTTON IS SQUARE, ALWAYS — stated, never inherited. The buttons are a
     flush stacked strip, and the open-panel marker below is an INSET BOX-SHADOW,
     which follows the border radius: any radius here turns the accent spine into a
     lozenge with curved ends, and abutting buttons then show a notch where two
     curves meet. A host page that rounds bare `button` elements (a very common
     reset — the StockApp shell has exactly that) would otherwise reach in and
     reshape a state indicator this control owns. Declaring 0 is the geometry the
     marker is drawn for. A host that out-specifies this still wins the cascade, so
     the consumer-side escape hatch is to exclude `.acc-rail-btn` from its own
     blanket rule — this declaration is what makes that a fix rather than a fudge. */
```


## § src/styles.css:795

*RTL: a COLLAPSED disclosure chevron points at the edge the content will unfold*

HEAD `src/styles.css:795` — 105 words. Attached to: `.acc-chevron:dir(rtl) {`

```text
/* RTL: a COLLAPSED disclosure chevron points at the edge the content will unfold
   from, which is the reading start — right in RTL, so the glyph must mirror. No
   logical property can express this (SVG geometry has no direction awareness) and
   a second glyph would be two things to keep in sync, so it is a mirror of the one
   glyph — the same "one glyph, rotated" reasoning the icon itself is built on.
   Deliberately lower specificity than the open rule above, which replaces the
   transform outright: a chevron rotated to point DOWN is symmetric about the
   vertical axis, so mirroring it would be a no-op anyway. */
```


## § src/styles.css:1024

*`.acc-flyout-host` is listed here because it IS a panel's content box — just o*

HEAD `src/styles.css:1024` — 136 words. Attached to: `.acc-content,`

```text
/* `.acc-flyout-host` is listed here because it IS a panel's content box — just one
   that lives in a Portal'd overlay instead of in a column. When auto-hide moves a
   panel's subtree into a flyout, the `.acc-content` div stays behind in the docked
   shell, so a rule scoped to that class alone leaves the flyout with no padding and
   no scroll: text flush against the border, and any content taller than the dock
   clipped by `.acc-flyout`'s `overflow: hidden` with no way to reach it.

   Widened here rather than restated in `autoHide.css` on purpose. Two copies of
   "what a content box looks like" is exactly the duplication that lets the docked
   and flying-out renderings drift apart, and they must be indistinguishable — the
   whole promise of pinning a flyout is that the content does not change, only where
   it lives. */
```


## § src/styles.css:1086

*Everything below is gated on `data-animated="true"`, which defaults to false —*

HEAD `src/styles.css:1086` — 148 words. Attached to: `/* ── horizontal: a column grows out of the rail ──`

```text
/* Everything below is gated on `data-animated="true"`, which defaults to false —
   an un-opted-in group is byte-for-byte the layout it was before this section
   existed. Nothing here changes a resting geometry; each rule only supplies the
   OTHER end of a transition the control was already snapping between.

   The two orientations need two different mechanisms, and neither is a choice of
   taste — it follows from what the collapsed state IS in each:

     horizontal  a collapsed panel is `display: none` (its activator is the rail
                 button), so the open state can be given an interpolable
                 zero-width start via @starting-style and grown from the rail.
     vertical    a collapsed panel is still a visible header bar, so nothing may
                 start from zero; the CONTENT has to be wiped open instead, which
                 is the `grid-template-rows: 0fr -> 1fr` trick that
                 @cujuju/solidjs-collapsible already uses (see
                 packages/collapsible/src/styles.css — `max-height` cannot
                 interpolate to a content height, an `fr` track can). */
```


## § src/styles.css:1115

*Stops the content REFLOWING while the column is narrower than its content*

HEAD `src/styles.css:1115` — 102 words. Attached to: `overflow: clip;`

```text
/* Stops the content REFLOWING while the column is narrower than its content
     (the min-width floors below hold the inner layout still, which means the
     inner boxes are wider than the panel for the length of the animation and
     would otherwise spill over the neighbouring column).
     `clip` rather than `hidden` because `hidden` would make the panel a scroll
     container, and `overflow-clip-margin` is what keeps this from breaking the
     splitter: that handle is deliberately positioned half OUTSIDE the panel
     (`right: calc(-1 * var(--_acc-splitter-overhang))`), so the clip region is
     expanded by exactly that overhang. Without it, animating a column would silently halve its resize
     hit area. */
```


## § src/styles.css:1144

*The "do not reflow while growing" floor, applied to the panel's in-flow*

HEAD `src/styles.css:1144` — 168 words. Attached to: `.acc-group[data-animated='true'][data-orientation='horizontal'][data-mode='fill']`

```text
/* The "do not reflow while growing" floor, applied to the panel's in-flow
   children rather than to the panel (the panel must be free to be narrow — that
   IS the animation). Held still, the inner boxes keep one line-break layout for
   the whole travel and the clip above reveals it; unheld, they rewrap at every
   frame between zero and full width.

   `fill` ONLY. The floor has to be a value the column can never REST below, or a
   transient clip becomes a permanent one, and `fill` is the only mode that
   guarantees one: its panels carry `min-width: var(--acc-col-min-width)` in CSS,
   which a user-dragged inline `flex` cannot get under.
   `natural` has no such floor — its columns are draggable down to
   DEFAULT_MIN_SIZE_PX (60px in resize.ts), well below --acc-col-width — so a
   fixed inner min-width there would silently clip ~170px off every column the
   user narrowed, for as long as animation stayed enabled. It gets the clip and
   nothing else, which is the other mitigation and the cheap one to be right
   about. */
```


## § src/styles.css:1182

*── vertical + natural: wipe the content open ──*

HEAD `src/styles.css:1182` — 102 words. Attached to: `@supports (grid-template-rows: 0fr) {`

```text
/* ── vertical + natural: wipe the content open ──
   The panel becomes the grid container itself: row 1 is the header bar, row 2 is
   the content, and row 2 is what travels 0fr -> 1fr. The sibling package puts
   this on a dedicated wrapper element; there is no wrapper in this markup, and
   the panel is the only box that (a) survives the collapse and (b) has exactly
   these two children, the splitter being absolutely positioned and therefore not
   a grid item.
   @supports because the trick needs a 0fr track to be legal — the same gate, and
   the same rationale, as the collapsible package's block. */
```


## § src/styles.css:1204

*The collapsed content has to stay in the BOX TREE for the row to have*

HEAD `src/styles.css:1204` — 203 words. Attached to: `.acc-group[data-animated='true'][data-orientation='vertical'][data-mode='natural']`

```text
/* The collapsed content has to stay in the BOX TREE for the row to have
     anything to interpolate: an empty 1fr track in a content-sized panel
     resolves to zero, so without this the close would snap and only the open
     would animate.
     This is NOT a hole in the "collapsed means invisible" contract that the
     `.acc-content[hidden]` rule above states — `visibility: hidden` keeps the
     content out of the accessibility tree and out of tab order exactly as
     `display: none` did. What it does NOT do is remove the box, and unlike
     `display` it INTERPOLATES: a visibility transition holds `visible` for the
     whole duration and flips at the end, so a closing panel's content stays on
     screen while its row shrinks instead of vanishing a frame early.
     `block` matches what the visible state resolves to in a `natural` group. The
     one case it does not is a `natural` group nested INSIDE a `fill` one, because
     the fill content rule matches by descendant rather than by child and hands it
     `flex` — such a panel re-lays-out its content once as the close starts.
     Left alone deliberately: tightening that selector to a child combinator is a
     layout change to non-animated groups, which is not this phase's to make. */
```


## § src/styles.css:1241

*── vertical + fill: not animated, and this is the reason ──*

HEAD `src/styles.css:1241` — 204 words. Attached to: `/* ── What this section could NOT do from CSS alone ──`

```text
/* ── vertical + fill: not animated, and this is the reason ──
   A `fill` panel's height is its flex share: `flex: 0 0 auto` collapsed,
   `flex: 1 1 0` open. `auto` is a keyword, so `flex-basis` steps rather than
   interpolates and a transition would POP at the halfway point — worse than the
   snap it replaced. Rejected alternatives:
     - Pin the collapsed basis to `var(--acc-header-height)` so both ends are
       lengths. Rejected: the header row is min-height, not height, so a consumer
       whose `actions` are taller than the token would get a clipped header the
       moment they turned animation on.
     - `min-height: min-content` on the panel instead of the token. Rejected: the
       min-content contribution of the content item is its own min-content height
       (`min-height: 0` removes the automatic minimum, it does not remove the
       contribution), so a collapsed panel would refuse to collapse.
     - Wipe the content row as `natural` does, leaving the panel's box to snap.
       Rejected: the box reaches full height on frame 1 while the row is still
       partway, so the panel paints a growing empty gap under its own content.
   The honest fix is a measured collapsed height, which needs script — see the
   note below. `interpolate-size: allow-keywords` will make the flex-basis
   version legal once it is not Chromium-only. */
```


## § src/styles.css:1261

*── What this section could NOT do from CSS alone ──*

HEAD `src/styles.css:1261` — 134 words. Attached to: `@media (prefers-reduced-motion: reduce) {`

```text
/* ── What this section could NOT do from CSS alone ──
   Both gaps above want the same one-line change in
   /mnt/e/Development/Projects/solidjs-toolkit/playground/src/mock/accordion-dock/AccordionPanel.tsx,
   and neither is made here because that file is owned elsewhere:
     1. Wrap `.acc-content` in a `<div class="acc-content-wrapper">` (exactly the
        element @cujuju/solidjs-collapsible has) and move `hidden` onto the
        wrapper. That gives the vertical wipe a dedicated clipping box, which
        removes the `display: block !important` override here AND lets `fill`
        mode animate its own height.
     2. Keep the panel's `order` at its LAST open index while it is closing
        (`data-closing`, or clamping `openIndex` to its previous value) so a
        horizontal column can be animated shut without teleporting to the rail.
   The column title bar also unmounts on close (`<Show when={horizontal() &&
   open()}>`), so even with (2) a closing column would shrink empty unless that
   Show is widened. */
```


## § src/styles.css:1297

*── Appearance: cards ────────────────────────────────────────────────────────*

HEAD `src/styles.css:1297` — 110 words. Attached to: `.acc-group[data-appearance='cards'] {`

```text
/* ── Appearance: cards ────────────────────────────────────────────────────────
   PURELY CHROME. Nothing below changes what the dock DOES — open, pin, reorder,
   size and flyout all behave identically; only what is drawn changes. Every rule
   is keyed on `[data-appearance='cards']`, so the default `flush` rendering is
   untouched by construction rather than by care.

   The flush look is ONE frame with panels divided by hairlines inside it. Cards
   inverts that: the frame moves onto each panel and the group stops drawing one,
   with a gap doing the dividing that separators did. Both orientations get it —
   vertical stacks the cards, horizontal sets them side by side — because the gap
   is applied along the group's main axis and needs no per-axis rule. */
```


## § src/styles.css:1368

*── The rail stays FLUSH, and is not a card ─────────────────────────────────*

HEAD `src/styles.css:1368` — 158 words. Attached to: `.acc-group[data-appearance='cards'][data-rail-side='left'] > .acc-rail,`

```text
/* ── The rail stays FLUSH, and is not a card ─────────────────────────────────
   Deliberate, and the one part of this with no obvious answer.

   A card frame says "I am a peer of the other cards". The rail is not: it never
   opens or closes, holds no content, cannot be pinned or reordered, and under the
   divider model it is the BOUNDARY between the static and dynamic regions — a
   boundary drawn as one of the things it separates is a category error. It is
   also ~32px wide, so a frame around it would be very nearly all border.

   So it keeps its flush strip against the group's edge. It still gets the gap
   (the group's `gap` applies to every child), which reads correctly: an edge
   fixture with the cards floating beside it at the same rhythm they float from
   each other. Its inner border goes, because that border's whole job was to
   divide it from columns it now has a gap from. */
```


---

# src/tearOff.tsx


## § src/tearOff.tsx:4

*TEAR-OFF — pop a docked panel into a real second browser window.*

HEAD `src/tearOff.tsx:4` — 694 words. Attached to: `/** Default popup size, px, when nothing has been persisted for this panel. Sized`

```text
/**
 * TEAR-OFF — pop a docked panel into a real second browser window.
 *
 * Fully wired: `index.ts` exports it,
 * `AccordionGroup` builds the controller, and `AccordionPanel` renders the ⤢
 * affordance behind its `tearOffable` prop. (This paragraph claimed the opposite
 * until 2026-07-25 — it was written before the wiring landed and nothing made it
 * false out loud. A stale "not implemented yet" is worse than no comment: it tells
 * a reader to go and build what is already there.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT ACTUALLY WORKS IN A BROWSER TAB — verified against solid-js 1.9.12 in
 * this repo's node_modules, not assumed:
 *
 * 1. `<Portal mount={otherDocument.body}>` DOES render into a foreign document.
 *    `Portal` builds its container with the OPENER's `document.createElement`
 *    and then does `mount.appendChild(container)`; per the DOM spec `appendChild`
 *    runs the adopting steps, so the subtree's `ownerDocument` becomes the
 *    popup's. Nothing in Portal compares documents, so there is no throw.
 *    (solid-js/web/dist/web.js — `function Portal`, and `createElement`, which is
 *    hard-bound to the module-scope `document`.)
 *
 * 2. `mount` is READ INSIDE Portal's `createEffect`, and the children memo is
 *    created once and cached (`content || (content = ...)`). So changing `mount`
 *    from the docked host to the popup body MOVES the existing nodes and REUSES
 *    the existing reactive graph — no remount, no lost component state. That is
 *    why this module always renders through one Portal whose `mount` toggles,
 *    rather than swapping between an inline branch and a Portal branch: the
 *    latter re-evaluates the children and destroys everything the panel's
 *    "content stays mounted while collapsed" rule exists to protect.
 *
 * 3. Solid's event DELEGATION does not cross documents on its own. Compiled JSX
 *    emits `delegateEvents(["click", ...])`, which does
 *    `document.addEventListener` on the OPENER document only; a click in the
 *    popup bubbles to the POPUP's document, where nothing is listening, so every
 *    `onClick` inside a torn-off panel would be dead. The fix is first-class and
 *    not a hack: `delegateEvents(eventNames, d?: Document)` takes the target
 *    document (see `solid-js/web/types/client.d.ts:29`), so we register the same
 *    handler on the popup document. Solid's `eventHandler` then walks up from
 *    `e.target`, and when it reaches Portal's container it follows the
 *    container's `_$host` getter back into the OPENER's tree — so a handler on an
 *    ancestor *in the dock* still fires for a click *in the popup*. That
 *    cross-document walk is the whole reason delegation and Portal compose.
 *
 * WHAT DOES NOT WORK, and why (read this before extending):
 *
 * a. Anything that captured the OPENER's `window`/`document` at module scope
 *    keeps talking to the opener. In THIS control that is `resize.ts` (splitter
 *    drags add `pointermove`/`pointerup` to the opener `window`),
 *    `@cujuju/solid-reorder-list` (same, on the opener `document`) and
 *    `gesture.ts` (menu dismissal on the opener `document`/`window`). A
 *    pointer gesture that starts inside the popup dispatches into the POPUP's
 *    document, so those listeners never fire and a drag would start and never
 *    end. Consequence, deliberate: only the panel's CONTENT is portalled. Do not
 *    portal the panel's chrome (splitter, rail button, context-menu trigger)
 *    into the popup without first making those helpers take a document.
 *
 * b. `createPanelMenu` → `ContextMenu` portals itself to `document.body` — the
 *    OPENER's body. A right-click inside the popup would open its menu in the
 *    other window. Same root cause as (a): a hard-bound `document`.
 *
 * c. Focus cannot be moved across windows. `moveFocus` calling `el.focus()` on an
 *    element in the popup focuses it *within that document* but does not raise
 *    the window; `window.focus()` is a request browsers routinely ignore. So
 *    roving keyboard focus cannot walk from a docked panel into a torn-off one.
 *    This is a browser limitation, not a fixable bug — an Electron host would
 *    provide it via `BrowserWindow.focus()`.
 *
 * d. Window PLACEMENT is a hint. `left`/`top`/`width`/`height` are honoured only
 *    for a genuine popup, and only on the primary screen unless the page holds
 *    the Window Management permission; several browsers clamp or ignore them
 *    outright. Geometry persistence below is therefore best-effort by design.
 *
 * e. `window.open` requires TRANSIENT USER ACTIVATION. `tearOff()` must be called
 *    synchronously from the click/keydown handler — after an `await` or a
 *    `setTimeout` the activation is spent and the popup is blocked. That case is
 *    reported, never swallowed.
 *
 * f. Vite HMR replaces the opener's `<style>` tags but cannot reach a module
 *    graph that is rendering into another document. Style edits are re-synced
 *    (see `syncStyles`); a hot-replaced COMPONENT is not, and the popup keeps
 *    rendering the old one until the panel is docked and torn off again.
 * ─────────────────────────────────────────────────────────────────────────────
 */
```


## § src/tearOff.tsx:126

*Distinguishes one controller's windows from another's.*

HEAD `src/tearOff.tsx:126` — 182 words. Attached to: `let nextControllerId = 0;`

```text
/**
 * Distinguishes one controller's windows from another's.
 *
 * The name used to be `prefix + panelId`, with a comment claiming that stopped two
 * groups on a page colliding. It did not: two docks holding a panel with the same
 * id — `explorer`, say, which is exactly the kind of id that repeats — produced the
 * same window name, so the second dock's tear-off ADOPTED the first's window
 * instead of opening its own. `window.open` with an existing name returns that
 * window, and `prepareDocument` then appended a second panel's chrome into a
 * document already holding the first's.
 *
 * The same shape bites a single group across an HMR remount: the old controller's
 * window survives (the opener is still alive, so the orphan watchdog does not fire)
 * and the new controller adopts it, stale content and all.
 *
 * A per-instance counter rather than a random id: it is deterministic, needs no
 * crypto, and answers the question actually being asked — "is this the same
 * controller?" — which is scoped to one document. Across a reload the counter
 * restarts, and that is correct, because the reloading document's `beforeunload`
 * closes its windows on the way out.
 */
```


## § src/tearOff.tsx:370

*Mirror the opener's stylesheets into the popup, and keep mirroring them.*

HEAD `src/tearOff.tsx:370` — 141 words. Attached to: `function syncStyles(source: Document, target: Document): () => void {`

```text
/**
 * Mirror the opener's stylesheets into the popup, and keep mirroring them.
 *
 * `adoptedStyleSheets` was considered and rejected: a constructed `CSSStyleSheet`
 * is bound to the document that constructed it, so handing the opener's sheets to
 * the popup's `adoptedStyleSheets` is a spec-level error, and rebuilding them in
 * the popup realm would mean reading `cssRules` — which throws for any
 * cross-origin sheet. Cloning nodes has neither problem and works for both the
 * dev and prod shapes above.
 *
 * The MutationObserver exists for HMR: Vite mutates the opener's style tags on
 * every CSS save, and without it a torn-off panel keeps the stylesheet it was
 * born with for the rest of the session. Repaints are coalesced into one
 * microtask so a burst of mutations costs one rebuild, and because the rebuild
 * removes and re-adds within a single task there is no paint in between and so
 * no flash.
 */
```


## § src/tearOff.tsx:468

*Attributes the TARGET owns, which mirroring must never touch.*

HEAD `src/tearOff.tsx:468` — 148 words. Attached to: `const TARGET_OWNED_ATTRS = new Set(['style']);`

```text
/**
 * Attributes the TARGET owns, which mirroring must never touch.
 *
 * `style` only, and it is load-bearing. `prepareDocument` builds the popup's
 * frame in inline styles on `<body>` — `margin: 0`, `height: 100vh`, `overflow:
 * hidden`, and the column flexbox the Portal container fills. `syncStyles` then
 * calls `mirrorAttributes(source.body, target.body)`, and because the opener's
 * own `<body>` carries no inline style in any normal page, the reconciliation
 * loop below removed the popup's `style` attribute outright — wiping that frame
 * milliseconds after it was set, and again on every coalesced resync.
 *
 * The visible result was a torn-off panel that did not fill its window and a
 * popup document that scrolled, which is precisely the "the window IS the panel"
 * contract `prepareDocument` documents.
 *
 * Excluded by NAME rather than by switching to a class/data-* allowlist, because
 * the mirror legitimately carries more than theme: `dir` drives this control's
 * RTL handling, and an allowlist built around theming would silently drop it.
 */
```


## § src/tearOff.tsx:684

*An opener that unloads must take its popups with it. A popup outliving its*

HEAD `src/tearOff.tsx:684` — 149 words. Attached to: `const onOpenerGone = (): void => {`

```text
/**
   * An opener that unloads must take its popups with it. A popup outliving its
   * opener still PAINTS — the DOM is real — but its reactive graph is gone, so
   * it is a frozen screenshot that looks live and accepts clicks that do
   * nothing. `beforeunload` fires for navigation, reload and close, which is the
   * full set of ways the opener's graph can die while the browser is healthy;
   * `pagehide` covers the bfcache path that `beforeunload` can skip. The popup's
   * own watchdog covers the rest — see ORPHAN_WATCHDOG_SOURCE.
   *
   * This deliberately does NOT reuse `finish`: that path defers `win.close()` to
   * a microtask so the panel's nodes can move home first, and the microtask
   * queue is not guaranteed to be drained once the document is unloading — the
   * close would simply never happen, which is the exact leak this handler
   * exists to prevent. Moving nodes home is pointless here anyway; the opener is
   * dying with them.
   */
```


## § src/tearOff.tsx:733

*Wrap a panel's content so it can be rendered into the dock OR into that*

HEAD `src/tearOff.tsx:733` — 111 words. Attached to: `/**`

```text
/**
 * Wrap a panel's content so it can be rendered into the dock OR into that
 * panel's window, without ever being rebuilt.
 *
 * There is exactly ONE `<Portal>` and its `mount` toggles — see (2). The two
 * wrappers this introduces are `display: contents` while docked, so they add no
 * box and no layout; they DO however appear in the selector chain, which is why
 * the two `.acc-content > .acc-group` rules in styles.css need widening. That
 * cost is accepted deliberately: the alternative (an inline branch swapped for a
 * Portal branch) re-evaluates the children on every tear-off and dock, throwing
 * away scroll position, text selection and in-flight edits — precisely what the
 * panel's keep-mounted-while-collapsed rule exists to preserve.
 */
```


---

# src/visualOrder.ts


## § src/visualOrder.ts:1

*The two rules that decide WHICH panels are where, and which survive a bulk*

HEAD `src/visualOrder.ts:1` — 176 words. Attached to: `/** The predicates a rule needs about one panel. Passed in rather than read off a`

```text
/**
 * The two rules that decide WHICH panels are where, and which survive a bulk
 * close. Both were previously inline expressions inside `AccordionGroup`, which
 * meant every other consumer had to re-derive them:
 *
 *   - the visual order had 2 implementations (the group, and the test stub);
 *   - the bulk-close exemption had 3 (the group's `collapseAll`, `panelMenu`'s
 *     `bulkClosableIds` holding the inverse, and the stub).
 *
 * A duplicated rule is not a tidiness problem here, it is a correctness one, and
 * `panelMenu` said so out loud before this file existed: its copy "only PREDICTS"
 * what `collapseAll` will do, and it uses that prediction to grey out a menu row.
 * A prediction that drifts is a row that disables when the action would have
 * worked, or offers an action that does nothing.
 *
 * So the rules live here, as PURE FUNCTIONS over plain data. Nothing in this file
 * reads a signal, touches the DOM, or knows what Solid is — which is what lets the
 * group, the menu and a hand-built test stub all call the same code instead of
 * agreeing to behave the same way.
 */
```


## § src/visualOrder.ts:51

*Open panels in the sequence they are PAINTED — the order a splitter walks to*

HEAD `src/visualOrder.ts:51` — 211 words. Attached to: `export function orderVisualOpen(input: VisualOrderInput): readonly string[] {`

```text
/**
 * Open panels in the sequence they are PAINTED — the order a splitter walks to
 * find its neighbour, the breadcrumb reads, and the flex `order` follows.
 *
 * The sequence is: non-leaf panels in user order, then leaves in chain order.
 *
 * Leaves last because a terminal detail pane is terminal; a leaf that sorted into
 * the middle would put a file's detail view between two folders. Non-leaves in
 * USER order rather than open order because there is exactly one order in this
 * control and both the rail and the columns render from it — that is what makes
 * dragging either representation move the other.
 *
 * FLYING-OUT PANELS ARE EXCLUDED, and that is the definition doing its job rather
 * than a special case bolted onto it: an auto-hide flyout is an overlay the
 * columns deliberately do not reflow around, so it is not IN the painted
 * sequence. Including it was a real defect with three symptoms, all of which
 * traced back to this one rule — a splitter got handed a neighbour with no box
 * (the drag seeded a start size of 0 and jumped by the min-size clamp), a flex
 * `order` slot was spent on something that is not a flex item, and the
 * first-column marker landed on the flyout instead of the column against the
 * rail.
 */
```


## § src/visualOrder.ts:84

*THE RAIL AS A DIVIDER between a static and a dynamic region.*

HEAD `src/visualOrder.ts:84` — 304 words. Attached to: `export interface RailPartitionInput {`

```text
/**
 * THE RAIL AS A DIVIDER between a static and a dynamic region.
 *
 * ── The state model this implements ─────────────────────────────────────────
 * `pinned` does NOT mean "is open". It means "opens as a docked COLUMN rather
 * than as a flyout". Open/closed is an independent axis, which gives four states
 * and a home for each:
 *
 *   open + pinned    → a docked column, sitting BEHIND the rail (static region).
 *                      No rail button: the column IS the panel's presence, and a
 *                      button that only ever re-reveals something already on
 *                      screen is a control with nothing to do.
 *   closed + pinned  → a rail button that reopens AS A COLUMN. This is the state
 *                      the column title bar's own activator produces, and the
 *                      reason `pinned` had to stop meaning "open": collapsing a
 *                      docked column must not throw away the fact that it docks.
 *   open + unpinned  → a flyout overlaying the dynamic region.
 *   closed + unpinned→ a rail button that reopens as a flyout.
 *
 * So: A RAIL BUTTON IS SHOWN WHENEVER THE PANEL IS CLOSED, and hidden only when
 * it is open AND pinned. Nothing can be stranded, in any combination.
 *
 * ── Why the static region comes first, and in PIN order ─────────────────────
 * Pinning is the user saying "this one stays put". The pinned columns therefore
 * take the group's leading edge, the rail slides to sit immediately after them,
 * and everything still dynamic — the flyouts, which overlay from the rail
 * onwards, and the leaf — lives past it. The rail stops being chrome bolted to
 * one edge and becomes the boundary between what is frozen and what moves.
 *
 * PIN order, not panel order: the sequence records the order the user froze
 * things in, so a newly pinned column appears at the end of the static run
 * instead of jumping into the middle of a layout the user just arranged. Re-
 * pinning an already-pinned panel moves it to the end for the same reason.
 */
```


## § src/visualOrder.ts:139

*Is this column hard against a boundary, so it must drop its own separator?*

HEAD `src/visualOrder.ts:139` — 101 words. Attached to: `isEdgeColumn: (id: string) => boolean;`

```text
/**
   * Is this column hard against a boundary, so it must drop its own separator?
   *
   * TWO columns qualify under the divider, not one: the leading STATIC column
   * (against the group's outer edge, where the rail used to be) and the first
   * DYNAMIC column (against the rail itself). Either would otherwise draw a
   * border a pixel away from an edge that already has one.
   *
   * With the divider off there is no static run, so this reduces to "the column
   * immediately after the rail" — exactly the single case the attribute meant
   * before, which is why the group needs no branch for the two layouts.
   */
```


## § src/visualOrder.ts:196

*Rewrite the pin order so it agrees with a sequence the user just dragged.*

HEAD `src/visualOrder.ts:196` — 225 words. Attached to: `export function repinToVisualOrder(input: {`

```text
/**
 * Rewrite the pin order so it agrees with a sequence the user just dragged.
 *
 * ── Why this function has to exist ──────────────────────────────────────────
 * Two systems were both claiming the painted sequence and one silently won. A
 * drag commits into the panel `order`, which `orderVisualOpen` honours — but
 * `partitionAtRail` then re-sorts the static region by PIN order, so for a pinned
 * column the drag committed and changed nothing on screen. In a dock where every
 * column is pinned (which is the point of pinning) that reads as drag-to-reorder
 * being dead, with no error and no clue.
 *
 * The resolution is not to drop pin order — the static sequence genuinely IS pin
 * order, that is what makes a newly frozen column land at the end of the frozen
 * run instead of jumping into the middle. It is that pin order is STORAGE for
 * that sequence, so the drag must write to it. The reorder decides the sequence;
 * the partition only decides where the rail splits it.
 *
 * Pinned-but-CLOSED panels keep their existing relative order at the end: they
 * are not on screen, so a drag between two visible columns carries no information
 * about where they belong — the same reasoning `moveOpenTo` already applies to
 * closed panels in the panel order.
 *
 * A drag that touches no pinned column returns an equivalent order, so callers
 * can apply this unconditionally rather than testing whether it was needed.
 */
```


## § src/visualOrder.ts:250

*Does this panel survive a BULK close (`collapseAll`, "Close All", "Close*

HEAD `src/visualOrder.ts:250` — 123 words. Attached to: `export function survivesBulkClose(id: string, p: PanelPredicates & {`

```text
/**
 * Does this panel survive a BULK close (`collapseAll`, "Close All", "Close
 * Others")?
 *
 * Two exemptions, and both are about the same distinction — a bulk close is
 * something that happens to a panel as a side effect of an action aimed
 * elsewhere, so it spares anything the user has said is not collateral:
 *
 *   - PINNED is the entire point of the pin in this control. The pin exempts a
 *     panel from AUTOMATIC collapse, which is what this is.
 *   - LEAVES are the RESULT of the selection the user just made. Sweeping them
 *     away would discard the thing their last click produced.
 *
 * Neither exemption applies to an EXPLICIT close — a panel's own ×, or a
 * breadcrumb truncation — which is why those paths call `setOpen` directly and
 * never consult this.
 */
```


---

# vitest.setup.ts


## § vitest.setup.ts:34

*A real in-memory `Storage`.*

HEAD `vitest.setup.ts:34` — 103 words. Attached to: `class MemoryStorage implements Storage {`

```text
/**
 * A real in-memory `Storage`.
 *
 * `localStorage` arrives in this environment as a bare object with none of the
 * Storage methods on it — `localStorage.clear` is not a function — so anything
 * that persists (the group's layout, tear-off window geometry) would either throw
 * or silently no-op behind the modules' own try/catch. Silently is the dangerous
 * one: a persistence test would pass by never persisting.
 *
 * Implemented rather than mocked, because the behaviour under test IS the
 * round-trip. A `vi.fn()` pair would assert that the module called setItem, not
 * that what it wrote can be read back — and the geometry round-trip is exactly a
 * write-then-read across two controller lifetimes.
 */
```


## § vitest.setup.ts:133

*The POPOVER API, stubbed.*

HEAD `vitest.setup.ts:133` — 154 words. Attached to: `type PopoverElement = HTMLElement & { __popoverOpen?: boolean };`

```text
/**
 * The POPOVER API, stubbed.
 *
 * jsdom 24 implements neither `showPopover`/`hidePopover` nor the `[popover]`
 * top-layer behaviour, so any test that actually OPENS a flyout threw before
 * reaching its assertion — which is why auto-hide had no rendered-group coverage
 * at all until vertical needed some. The tell was that the only passing flyout
 * tests were the ones where no flyout opened.
 *
 * A STUB in the same sense as the ResizeObserver above: it makes the calls
 * succeed and keeps `:popover-open` answerable, without pretending to implement a
 * top layer jsdom has no way to paint. Tests here assert DOM STRUCTURE and group
 * STATE — that the panel is marked as flying out, that its header survives, that
 * its inline content host is hidden — none of which depend on the popover
 * actually being raised. Anything that genuinely needs the top layer belongs in a
 * browser test, which is where the horizontal flyout's own layering bug was
 * caught (see the header of `autoHide.css`).
 */
```

