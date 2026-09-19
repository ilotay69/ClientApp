# Staff sidebar structure

Organize navigation by the work a person is doing, not by the integration vendor.
Dashboard and My To-Do are always outside the accordion (Dashboard still requires
its existing permission). Show only categories with at least one permitted link.

| Category | Available pages | Planned additions |
| --- | --- | --- |
| Clients & Knowledge | Clients, Touchpoints, Quarterly Reviews | Client Knowledge Base |
| Service Delivery | Tasks, Projects | PSA / Service Desk |
| IT Operations | Daily Backup Reports, Network Tools (Domain Health + CG Watcher) | PRTG monitoring, PagerDuty incidents and on-call |
| Security & Access | None yet; do not render an empty category | Password Manager |
| Sales & Finance | Internal Sales, Proposals, Reconciliation | Sales and billing workflows |
| Reports & Analysis | Reports, Analysis | Cross-client reporting and analytics |
| People & Team | Team, Recruitment | Staff management workflows |
| Settings | My Profile, Mailbox, Integrations, Client Mapping | Connection setup for new integrations |

The planned additions describe placement only; they are not implemented pages or
links. Add Security & Access between IT Operations and Sales & Finance when its
first permitted page is ready. Integration credentials and configuration belong
under Settings > Integrations, even when the tool's operational page belongs in
another category. Keep client-specific detail tabs inside each client record.
Daily Backup Reports uses the existing `/backups` daily checklist and report
history. Keep day-to-day backup follow-up here; broader trends belong in Reports
& Analysis.

## Accordion behavior

- Start every fresh authenticated layout with all categories collapsed, including
  direct links to a nested page. Do not restore expansion from browser storage.
- Allow at most one open category. Clicking its heading again closes it.
- Keep the chosen category during client-side navigation and share expansion
  between the desktop sidebar and mobile drawer.
- Highlight the category containing the current page, even while collapsed;
  expose that page's name to screen readers without opening the category.
- Preserve per-link permissions and owner-only indicators. Never expose a link
  just because its category is visible.
- Use accessible buttons, unique panel IDs, inert collapsed panels, smooth
  transitions, and reduced-motion support.
