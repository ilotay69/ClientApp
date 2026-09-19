# CG interaction components

Shared components live in `src/components/ui`. These are CG-specific implementations inspired by the interaction patterns discussed for Dashboard and My To-Do, not copied demo layouts. They use the existing Base UI and Motion dependencies; no new package is required.

## Components and current use

| Pattern                    | Component                             | Integration                                                                                     |
| -------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Action feedback            | `StatefulButton`, `useActionFeedback` | Dashboard refresh/layout save; task refresh/save, notes, mailbox sync, plans and leave requests |
| Moving option highlight    | `HoverGroup`, `HoverButton`           | Dashboard widget picker and saved task views                                                    |
| Expandable summaries       | `ExpandableCard`                      | Explicit Details buttons in populated dashboard widgets                                         |
| Animated dialogs           | `AnimatedDialog`                      | Dashboard picker/settings, snapshot details, existing resizable My To-Do panels                 |
| Anchored reference preview | `TooltipCard`                         | Client references in task rows                                                                  |
| Supplemental tooltip       | `AnimatedTooltip`                     | Note-author initials, planning controls, settings and dashboard actions                         |
| Sliding selection          | `AnimatedTabs`                        | Old/New view, My To-Do sections, List/Board, Hours/Leave                                        |
| Consistent card surfaces   | `BentoCard`, `BentoGrid`              | Dashboard widgets and priority summary strip                                                    |

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

```sh
node --test tests/action-feedback.test.mjs tests/dashboard-workspace.test.mjs tests/my-todo-workspace.test.mjs
npx eslint src/components/ui src/components/my-todo src/components/dashboard-workspace.tsx src/components/dashboard-widget-content.tsx src/lib/action-feedback.ts
npm run build
```

Browser QA uses a separate local fixture with fictional data and mocked writes, not production records. Check pending/error/retry feedback, modal focus loops and nested Escape, preview focus return, widget add/configure/save, and narrow layouts. The sidebar and classic screen implementations are intentionally unchanged.
