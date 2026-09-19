# Clients workspace

The Clients redesign is scoped to **New view**. The global sidebar is unchanged.

## Directory

The directory deliberately remains name-only. It has name search, alphabetical sorting, favorites, comfortable/compact spacing, pagination, and an explicit read-only preview. It does not add account owner, work totals, health scores, or other data columns. Adding clients still uses the existing Autotask import flow.

The read-only preview uses the normal authenticated Supabase client, checks `view_clients`, and returns only the selected contact/address fields. It does not trigger integration syncs.

## Client record

- `view=old|new` is shared by the directory and detail page. Explicit URL choice takes precedence over the browser's `cg-clients-view` cookie, scoped to `/clients`. New view is the default.
- `section` selects a stable client section; `sub` selects an Identity/Intune sub-section. Unknown values safely resolve to the default. These are real links with browser history, not client-only tabs.
- `CGBranchedNav` is an original CG disclosure navigation. Overview stays visible, groups start collapsed on Overview, and only one opens at a time. A deep link opens its selected group. Collapsed children are inert. Small screens use `CGSelect` instead of a second sidebar.
- Relationship: contacts, activity, touchpoints, sent quarterly reviews.
- Work & services: tickets/PSA, tasks, projects, sales, contracts.
- Systems & continuity: NinjaOne devices, Intune devices/policies, domain health.
- Cloud & security: licenses, mailboxes, MFA/sign-in, Conditional Access, risky users, detections, Secure Score, Huntress.
- Knowledge & access: existing protected documents.
- Settings: client details, connections, permission-gated danger zone.

PRTG, backup-source integrations, PagerDuty, knowledge-base authoring and password-vault integrations are **not implemented by this UI rollout** and do not appear as working/connected menu entries. Existing standalone tools remain unchanged.

## Reusable controls

- `CGBranchedNav`: grouped route links with disclosure buttons, curved SVG connectors, a drawn red selection path, and a sliding group marker. Decorative geometry is independently tested. Focus styling, reduced-motion support, and mobile selection stay intact.
- `CGRecordTable`: searchable, sortable, paginated records with optional filters, column visibility and detail drawers. Numeric/raw `sortValues` can differ from human-readable cell values. The table scrolls horizontally inside its own keyboard-focusable region on small screens.
- `CGActionPopover`: click/keyboard action and settings groups, anchored through Base UI.
- `CGActivityFeed`: compact or detailed operational activity, with an accessible detail drawer. No scroll tracing or decorative entrance sequence.
- `CGDocumentDropzone`: accessible file selection and drag/drop. It validates supported extensions and the 20 MB limit; the server independently validates uploads. Selection never reports upload success.
- `CGConfirmDiscard`: a themed confirmation nested inside the existing accessible dialog foundation, with separate Keep editing and Discard actions.
- `useBrowserPreference`: user-scoped, non-sensitive display preferences only. Browser storage failures fall back to session memory. No client record bodies, credentials, or documents are cached by this hook.

The existing CG selects, stateful buttons, tooltips, dialogs and status marks are reused. No new dependency was needed; a table-library dependency was unnecessary for the name-only directory and bounded record-table requirements.

Favorites/density and overview order are saved per user in this browser. The overview supports moving sections earlier/later and pinning one to the top. These are not cross-device database preferences. Record-table filters and column changes currently belong to the mounted table.

Dashboard, My To-Do and Clients omit the redundant Workspace breadcrumb strip. Appearance switches sit with existing page controls; the client back link stays beside the client heading. Old-view controls are retained without the extra breadcrumb.

## Data and safety

`legacy-client-page.tsx` retains the classic rendering path and shared query definitions. `loadSection` calls query factories only for the active New-view dataset. Identity and Intune load only their selected sub-section. The overview loads its summaries and activity, not the entire device/security inventory. `workspace-renderer.tsx` is server-only and only sends active-section content and explicit header/composer fields to the browser.

New-view navigation does not trigger the old fire-and-forget NinjaOne/M365 auto-sync. Refresh is explicit in the connection panel. Existing scheduled syncs are unaffected. Historical `*_last_synced_at` fields were written before automatic attempts finished, so they are labelled **Last automatic attempt**, not last successful sync. A manual refresh reports success only after the action returns `error: null`; M365 explains that optional permission-dependent datasets may be partial. Source timestamps use an explicit UTC zone to avoid server/browser hydration differences.

Query failures are displayed with retry and are not converted into successful zero/healthy states. Unmapped sources are distinct from empty cached results. New client-task summaries exclude private My To-Do records. Existing action authorization, protected document download routes and permissions remain authoritative. Destructive client management is tucked into Settings, still confirmed and server-checked.

Drafts stay intact after failed saves. Closing a dirty editor asks whether to keep editing or discard; pending writes block dismissal and repeated submission. Reload/unload uses the browser's native unsaved-work warning. No simulated progress or invented health scores are shown. Client drawers are offset below the staging banner.

## Verification

Run the existing interaction/workspace tests plus `tests/client-workspace.test.mjs`, targeted ESLint, and a production build. Local browser QA uses an isolated Next fixture with fictional records and mocked writes, never customer records. Cover directory search/preview, accordion behavior, direct links, record drawers, filters, mobile selector and table overflow, guarded drafts, upload selection, and pending/error/success feedback.
