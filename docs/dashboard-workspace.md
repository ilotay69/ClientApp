# Dashboard workspace

The dashboard has an **Old view / New view** switch. Old view retains its original cards and Settings → Dashboard preferences. New view uses a separate, per-user workspace; the sidebar is unchanged.

## Customization

- Choose **Customize**, drag a card by its handle, and resize using its bottom-right corner.
- Widget settings use the previous single-form layout: title, visualization, accent, visual size presets, content count and position. The dashboard's Save layout / Cancel flow is unchanged.
- Accent colours affect card edges, header marks, ordinary list numbers and charts; priority/warning colours remain semantic. The size guide uses the selected accent instead of hard-coded red. Opening settings does not fetch integrations.
- Widget size uses visual width presets (quarter through full width), named heights, and a desktop footprint guide. Fine-tune size exposes keyboard-accessible precision fields for all existing grid sizes; opening the editor never rounds saved custom sizes. Heights show actual CSS pixels for the selected density. Items/categories to show is separate from size and hidden for number-only widgets.
- **Add widget** opens a searchable, permission-filtered library of 15 sources. Add a source more than once for different visualizations, up to 24 widgets.
- **Save layout** persists the draft. **Cancel** restores the last saved layout. **Reset layout** prepares a recommended layout but does not overwrite anything until saved.
- Desktop, tablet, and mobile positions are saved independently. Spacing can be comfortable or compact. Intentionally empty boards are supported.

Counts and charts use existing operational data. The new Task outlook source groups assigned tasks by due date; it is a current snapshot, not invented historical trend data. Integration errors are shown as errors, not zero totals. The compact Thinking Orb is used while live integrations load and respects reduced-motion preferences. Gooey effects are deliberately not used in the data grid.

## Record drill-downs

- Every successfully loaded card has a **View all** footer outside its scrollable body. It opens all records in that widget's snapshot, independent of the widget's item limit.
- Bars, donut segments and legend buttons open **only the selected category** in the reusable `DashboardWidgetRecords` modal. It includes search, 25-row pagination, record links, keyboard access, Escape dismissal and focus restoration.
- Exact category keys drive filtering, not displayed badges. Grouped **Other** segments retain all of their original category keys. Workload uses assignee IDs so identical names cannot mix tasks.
- Workload drill-downs show underlying tasks; recruitment drill-downs show candidates. Hours is explicitly labelled **resource summaries**, since that integration supplies per-person totals rather than individual time entries.
- Database snapshots page beyond the default row cap using the same RLS-scoped queries. A later-page error fails the whole snapshot instead of showing partial totals as complete. Live integrations retain their existing permission checks and source snapshot scope.
- Old view, saved layout format, the sidebar and Clients padding are unchanged.

## Persistence and security

Apply `supabase/152_dashboard_workspaces.sql` before deploying. It adds `dashboard_workspaces`, independent of classic `dashboard_preferences`, with own-user RLS and a 64 KiB config limit. No production data migration or existing preference replacement is required.

Server actions authenticate users, require dashboard access, re-check eligible widget sources, and normalize untrusted configuration. Live integration actions reuse existing permission guards. Alert acknowledgment checks ownership and reports failures without hiding the alert.

## Verification

Run `node --test tests/dashboard-workspace.test.mjs tests/dashboard-drilldown.test.mjs` on the project's Node 24 runtime. The tests cover defaults, round trips, empty boards, permission revocation, duplicate IDs, input bounds, independent copies, exact category filtering, Other membership, missing labels, full-list independence from card limits and paged snapshot failures.

Browser QA should cover add/remove/save/cancel/reset, view switching, keyboard configuration, drag/resize, narrow screens, and integration failures. Database QA should verify own-row reads/writes and denied cross-user reads/writes inside a rolled-back transaction.
