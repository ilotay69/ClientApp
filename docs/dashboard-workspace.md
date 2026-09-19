# Dashboard workspace

The dashboard has an **Old view / New view** switch. Old view retains its original cards and Settings → Dashboard preferences. New view uses a separate, per-user workspace; the sidebar is unchanged.

## Customization

- Choose **Customize**, drag a card by its handle, and resize using its bottom-right corner.
- Open a card's settings to change its title, accent, visualization (list, bars, donut, number), width, height, and visible row/category count. Keyboard users can use Move earlier / Move later and size selectors instead of dragging.
- Widget size uses visual width presets (quarter through full width), named heights, and a live desktop footprint guide. Fine-tune size exposes keyboard-accessible sliders for all existing grid sizes; opening the editor never rounds saved custom sizes. Heights show actual CSS pixels for the selected density. Items/categories to show is separate from size and hidden for number-only widgets.
- **Add widget** opens a searchable, permission-filtered library of 15 sources. Add a source more than once for different visualizations, up to 24 widgets.
- **Save layout** persists the draft. **Cancel** restores the last saved layout. **Reset layout** prepares a recommended layout but does not overwrite anything until saved.
- Desktop, tablet, and mobile positions are saved independently. Spacing can be comfortable or compact. Intentionally empty boards are supported.

Counts and charts use existing operational data. The new Task outlook source groups assigned tasks by due date; it is a current snapshot, not invented historical trend data. Integration errors are shown as errors, not zero totals. The compact Thinking Orb is used while live integrations load and respects reduced-motion preferences. Gooey effects are deliberately not used in the data grid.

## Persistence and security

Apply `supabase/152_dashboard_workspaces.sql` before deploying. It adds `dashboard_workspaces`, independent of classic `dashboard_preferences`, with own-user RLS and a 64 KiB config limit. No production data migration or existing preference replacement is required.

Server actions authenticate users, require dashboard access, re-check eligible widget sources, and normalize untrusted configuration. Live integration actions reuse existing permission guards. Alert acknowledgment checks ownership and reports failures without hiding the alert.

## Verification

Run `node --test tests/dashboard-workspace.test.mjs` on the project's Node 24 runtime. The tests cover defaults, round trips, empty boards, permission revocation, duplicate IDs, input bounds, independent copies, and category grouping.

Browser QA should cover add/remove/save/cancel/reset, view switching, keyboard configuration, drag/resize, narrow screens, and integration failures. Database QA should verify own-row reads/writes and denied cross-user reads/writes inside a rolled-back transaction.
