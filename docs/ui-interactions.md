# CG interaction components

Shared components live in `src/components/ui`. These are CG-specific implementations inspired by the interaction patterns discussed for Dashboard and My To-Do, not copied demo layouts. They use the existing Base UI and Motion dependencies; no new package is required.

## Components and current use

| Pattern                     | Component                             | Integration                                                                                     |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Action feedback             | `StatefulButton`, `useActionFeedback` | Dashboard refresh/layout save; task refresh/save, notes, mailbox sync, plans and leave requests |
| Moving option highlight     | `HoverGroup`, `HoverButton`           | Dashboard widget picker and saved task views                                                    |
| Expandable summaries        | `ExpandableCard`                      | Explicit Details buttons in populated dashboard widgets                                         |
| Animated dialogs            | `AnimatedDialog`                      | Dashboard picker/settings, snapshot details, existing resizable My To-Do panels                 |
| Anchored reference preview  | `TooltipCard`                         | Client references in task rows                                                                  |
| Supplemental tooltip        | `AnimatedTooltip`                     | Note-author initials, planning controls, settings and dashboard actions                         |
| Sliding selection           | `AnimatedTabs`                        | Old/New view, My To-Do sections, List/Board, Hours/Leave                                        |
| Consistent card surfaces    | `BentoCard`, `BentoGrid`              | Dashboard widgets and priority summary strip                                                    |
| Searchable reference fields | `CGSelect`                            | Task filters and editor; widget spacing and content limits                                      |
| Confirmed task completion   | `CompletionCheck`                     | New My To-Do task rows, separately from opening details                                         |
| Scoped notifications        | `useNotices`, `NoticeRegion`          | Task actions/Undo and dashboard layout save                                                     |
| Operational status          | `StatusMark`                          | Data loading, connection errors, preference saves and toasts                                    |
| Stable value transitions    | `AnimatedNumber`                      | Open-task count and non-critical widget totals                                                  |
| List settling               | `SettleRow`                           | New task list changes, disabled inside Today drag/reorder and board layouts                     |
| Display preferences         | `SettingSwitch`                       | Client-name and priority visibility                                                             |
| Precise dimensions          | `PrecisionField`                      | Advanced widget sizing, after human-readable width/height presets                               |

## CG workspace controls

The React Bits review informed interaction choices, not an implementation dependency. These are original CG wrappers and styles built on our installed Base UI and Motion foundations. `workspace-controls.module.css` owns scoped warm-white, charcoal, muted-sage and CG-red tokens; there are no global CSS overrides or added packages. Import individual components where needed. This rollout is restricted to Dashboard **New view** and the new `TodoWorkspace`; the legacy screens and sidebar are unchanged.

- `CGSelect`: controlled string `value`, `options: {value, label, tone?, disabled?}[]`, `onChange`, and accessible `label`. Use `searchable` for long client lists; short lists retain select type-ahead. Both modes support arrows, Enter, Escape, focus return and anchored collision-aware popups. Color dots supplement text, never replace it. When options are embedded in forms, use a `div` field wrapper and the component's `label` rather than nesting popup contents in a native label.
- `CompletionCheck`: controlled `checked`, `pending`, `disabled`, `label`, and `onChange`. A native button with checkbox semantics keeps the action distinct from row navigation. The caller waits for a confirmed write before changing task status. The pending state blocks repeat clicks; failures leave the task unchanged.
- `useNotices` returns a stable local `manager` and `notify(title, options?)`; mount one `NoticeRegion` for that manager. `options.action` has `label` and `run: () => Promise<boolean>`. Only explicit `true` dismisses a completed action. Rejection/false leaves it retryable with a persistent error. Ordinary notices time out after six seconds, paused by Base UI during hover/focus. Error and action/Undo notices remain until used or dismissed. Each completion captures its own task version; later unrelated notices cannot steal its Undo. Swipe-right dismissal supplements a visible close button. Do not pass sensitive integration payloads to notices.
- `StatusMark`: `state="idle" | "running" | "success" | "error"`, optional visible `label`. It is not a live region by itself: the caller chooses announcements. A fetched record count is not a health status; never show green merely because a request completed. No simulated progress percentages or AI stages.
- `AnimatedNumber`: shows the actual confirmed `value` immediately, with a short cross-fade on changes and one exact screen-reader value. It has no zero-to-value count-up or fabricated intermediate values. Urgent, overdue, incident and failed-backup totals stay static. Optional `maximumFractionDigits` defaults to zero.
- `SettleRow`: use stable keys inside `AnimatePresence initial={false}`; disable with `enabled={false}` on drag/reorder surfaces. No scroll entrance effects or document-level keyboard handlers. Changes settle in 160ms; reduced motion removes the animation.
- `SettingSwitch`: controlled `checked`, `onChange`, `label` and `disabled`. The real setting changes only after the caller confirms persistence; no exaggerated deformation.
- `PrecisionField`: `label`, `hint`, `value`, `min`, `max`, `onChange`. Type a whole number and commit on blur, use +/- or arrows, or optionally scrub its label. Multi-digit input is not prematurely clamped; committed values respect bounds. The dashboard keeps visual presets and percentage/pixel explanations above these advanced controls. Changing a dimension remains a draft until **Save layout**.

Keep motion short and respect `prefers-reduced-motion`. Do not add swipe-only task actions (they compete with Today drag), decorative cursors/backgrounds, hold-to-save, extra task editors, or fake progress stages. Reuse the controls without changing workflow semantics.

## Action feedback

`StatefulButton` is controlled: pass `idle`, `pending`, `success`, or `error`. It supports native button props (including `type="submit"` and `ref`) and existing screen button classes. Override `pendingLabel`, `successLabel`, `errorLabel` and `icon` as needed. Label space and the icon slot are reserved so status changes do not move adjacent controls.

For an awaited operation:

```tsx
const feedback = useActionFeedback();

<StatefulButton
  className={styles.primary}
  status={feedback.status}
  onClick={() =>
    feedback.run(async () => {
      const result = await saveSettings();
      return result.error !== undefined
        ? { ok: false, error: result.error }
        : { ok: true };
    })
  }
>
  Save settings
</StatefulButton>;
{
  feedback.error && <p role="alert">{feedback.error}</p>;
}
```

The confirmation boundary requires explicit `{ ok: true }`. A fulfilled promise, missing result, or resolved server error is not success. The hook prevents duplicate submissions, keeps errors retryable, resets a confirmed success after 2.5 seconds, and cleans up timers on unmount. Surface the error beside the action; the short button label is not a substitute for an explanation. Keep drafts on failure.

Use controlled pending state for `router.refresh()`; it does not return a success result. Do not invent a successful sync or show a timed success before a request completes. Task saves that close the editor keep the existing success notice rather than delaying navigation to show an animation.

## Dialogs and previews

`AnimatedDialog` accepts `open`, `onOpenChange`, `title`, `description`, `children`, and optional `trigger`. Use `variant="drawer"` for side panels. `className`, `bodyClassName`, `style`, `beforeHeader`, `initialFocus`, and `finalFocus` support existing layouts and resize handles. Keep the root mounted when exit transitions are desired. Existing draft-discard checks belong in the caller's close handler.

Base UI handles focus containment/restoration, Escape, outside dismissal and scroll locking. `ExpandableCard` wraps this dialog with an explicit trigger; it does not turn the whole widget into a button or intercept drag handles/links. Snapshot previews show only the rows/totals already loaded for the widget, label their limited scope and link to the original source for full results. They do not make integration requests or alter the saved layout.

`TooltipCard` accepts a real button `trigger`, `title`, optional `description` and content. It is a stable, collision-aware popover with delayed hover plus click/keyboard support and a close button. Use already-authorized data only; no third-party screenshot or unfurl services. Client preview links retain normal route authorization.

`AnimatedTooltip` is supplemental. Always give icon-only triggers accessible names. Keep important information visible without hover; note-author names remain beside their initials. Never make a hover tooltip the sole route to an action on touch devices.

## Motion and layout

The palette is warm white, charcoal and CG red. Highlights animate backgrounds, not whole rows. Dialogs use short opacity/translation transitions, not 3D or bouncing effects. CSS and Motion respect reduced-motion preferences.

`AnimatedTabs` keeps option order fixed. Use `navigation` for section selectors, otherwise it is a pressed-button choice group. Arrow keys/Home/End move focus; Enter/Space activates. It deliberately does not claim `tablist`/`tabpanel` semantics for these URL-driven section buttons.

`HoverButton` belongs inside `HoverGroup`; focus receives the same soft highlight as hover. Touch interactions do not depend on it. `BentoCard`/`BentoGrid` are presentational and have low-specificity defaults so caller styles can set responsive geometry. They do not replace `react-grid-layout`, the dashboard schema, resize/drag controls or saved layouts.

## Verification

Clients **New view** now reuses this foundation and adds the client-specific compositions documented in [client-workspace.md](./client-workspace.md). Shared additions include `CGBranchedNav`, `CGRecordTable`, `CGActionPopover`, `CGDocumentDropzone`, `CGConfirmDiscard`, and `useBrowserPreference`. Classic Clients and the global sidebar retain their existing appearance.

```sh
node --test tests/action-feedback.test.mjs tests/dashboard-workspace.test.mjs tests/my-todo-workspace.test.mjs tests/workspace-controls.test.mjs
npx eslint src/components/ui src/components/my-todo src/components/dashboard-workspace.tsx src/components/dashboard-widget-content.tsx src/lib/action-feedback.ts
npm run build
```

Browser QA uses a separate local fixture with fictional data and mocked writes, not production records. Check pending/error/retry feedback, modal focus loops and nested Escape, preview focus return, widget add/configure/save, and narrow layouts. The sidebar and classic screen implementations are intentionally unchanged.

Workspace-control QA also covers: searchable clients via arrows/Enter; nested-menu Escape returning focus without closing the editor; completion staying unchecked during a pending write; completion plus versioned Undo; persistent failed notification actions; bounds, empty input and multi-digit numeric entry; and 390px/320px task and widget settings layouts. No live customer data is mutated by these fixtures.
