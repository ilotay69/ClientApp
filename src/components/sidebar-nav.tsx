"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconGrid,
  IconCheckSquare,
  IconBriefcase,
  IconFolder,
  IconCalendar,
  IconMail,
  IconUser,
  IconList,
  IconSparkles,
  IconTag,
  IconUsers,
  IconClock,
  IconDownload,
  IconRefresh,
  IconGlobe,
  IconLogOut,
  IconMenu,
  IconX,
  IconLock,
  IconDatabase,
  IconClipboardCheck,
  IconSliders,
  IconFileText,
} from "@/components/icons";
import { NotificationBell } from "@/components/notification-bell";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  /** Shows a small lock after the label — true while no non-Owner role
   * currently has the permission behind this link granted, so Owner is
   * effectively the only one with access right now (see
   * isPermissionOwnerOnly). Disappears on its own once the Owner grants
   * the permission to another role. */
  ownerOnly?: boolean;
};

export function SidebarNav({
  userLabel,
  canManageIntegrations,
  canManageTeam,
  canViewReports,
  canManageTouchpoints,
  canViewDomainHealth,
  canViewLookups,
  canViewAnalysis,
  canViewDashboard,
  canViewClients,
  canViewProjects,
  canViewTeamTasks,
  canViewSalesRequests,
  canManageRecruitment,
  canManageReconciliation,
  canManageBackups,
  canManageQuarterlyReviews,
  canViewProposals,
  teamOwnerOnly,
  integrationsOwnerOnly,
  touchpointsOwnerOnly,
  domainHealthOwnerOnly,
  recruitmentOwnerOnly,
  reconciliationOwnerOnly,
  backupsOwnerOnly,
  quarterlyReviewsOwnerOnly,
  proposalsOwnerOnly,
  signOutAction,
}: {
  userLabel: string;
  canManageIntegrations: boolean;
  canManageTeam: boolean;
  canViewReports: boolean;
  canManageTouchpoints: boolean;
  canViewDomainHealth: boolean;
  canViewLookups: boolean;
  canViewAnalysis: boolean;
  canViewDashboard: boolean;
  canViewClients: boolean;
  canViewProjects: boolean;
  canViewTeamTasks: boolean;
  canViewSalesRequests: boolean;
  canManageRecruitment: boolean;
  canManageReconciliation: boolean;
  canManageBackups: boolean;
  canManageQuarterlyReviews: boolean;
  canViewProposals: boolean;
  /** True only while no non-Owner role has been granted the permission —
   * disappears on its own once one is (see isPermissionOwnerOnly). */
  teamOwnerOnly: boolean;
  integrationsOwnerOnly: boolean;
  touchpointsOwnerOnly: boolean;
  domainHealthOwnerOnly: boolean;
  recruitmentOwnerOnly: boolean;
  reconciliationOwnerOnly: boolean;
  backupsOwnerOnly: boolean;
  quarterlyReviewsOwnerOnly: boolean;
  proposalsOwnerOnly: boolean;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // My To-Do is the one link always shown regardless of permission — it's
  // a signed-in user's own list (tasks, mailbox analysis, tickets), never
  // gated. Tasks (the team-wide list) requires view_team_tasks like every
  // other link here.
  const MAIN_LINKS: NavItem[] = [
    ...(canViewDashboard ? [{ href: "/dashboard", label: "Dashboard", icon: IconGrid }] : []),
    ...(canViewClients ? [{ href: "/clients", label: "Clients", icon: IconBriefcase }] : []),
    ...(canViewProjects ? [{ href: "/projects", label: "Projects", icon: IconFolder }] : []),
    { href: "/my-todo", label: "My To-Do", icon: IconCheckSquare },
    ...(canViewTeamTasks ? [{ href: "/tasks", label: "Tasks", icon: IconList }] : []),
    ...(canManageTouchpoints
      ? [
          {
            href: "/touchpoints",
            label: "Touchpoints",
            icon: IconCalendar,
            ownerOnly: touchpointsOwnerOnly,
          },
        ]
      : []),
    ...(canViewSalesRequests
      ? [{ href: "/sales-requests", label: "Internal Sales", icon: IconTag }]
      : []),
    // Sits with the sales work rather than under Insights & Reports: a
    // proposal is something you write and chase, not something you read off
    // a dashboard.
    ...(canViewProposals
      ? [
          {
            href: "/proposals",
            label: "Proposals",
            icon: IconFileText,
            ownerOnly: proposalsOwnerOnly,
          },
        ]
      : []),
    ...(canManageRecruitment
      ? [
          {
            href: "/recruitment",
            label: "Recruitment",
            icon: IconUsers,
            ownerOnly: recruitmentOwnerOnly,
          },
        ]
      : []),
  ];

  const settingsLinks: NavItem[] = [
    ...(canManageTeam
      ? [{ href: "/team", label: "Team", icon: IconUsers, ownerOnly: teamOwnerOnly }]
      : []),
    ...(canManageIntegrations
      ? [
          {
            href: "/settings/integrations",
            label: "Integrations",
            icon: IconSparkles,
            ownerOnly: integrationsOwnerOnly,
          },
        ]
      : []),
    // Sits under Integrations since it's the same kind of setting, but stays
    // its own link — the mailbox connection is per-user and ungated, unlike
    // the Integrations page, which requires manage_integrations.
    { href: "/settings/mail", label: "Mailbox", icon: IconMail },
    // Per-user Autotask resource mapping (My Tickets/Team Hours matching)
    // — same ungated, personal-setting posture as Mailbox above it.
    { href: "/settings/profile", label: "My Profile", icon: IconUser },
    // Domain Health + CG Watcher, behind one tabbed page — standalone
    // utilities, not tied to a client/project workflow.
    ...(canViewDomainHealth
      ? [
          {
            href: "/domain-health",
            label: "Tools",
            icon: IconGlobe,
            ownerOnly: domainHealthOwnerOnly,
          },
        ]
      : []),
  ];

  const insightsLinks: NavItem[] = [
    ...(canViewLookups ? [{ href: "/hours", label: "Lookups", icon: IconClock }] : []),
    ...(canViewReports ? [{ href: "/reports", label: "Reports", icon: IconDownload }] : []),
    ...(canViewAnalysis
      ? [{ href: "/settings/catalog", label: "Analysis", icon: IconList }]
      : []),
    ...(canManageReconciliation
      ? [
          {
            href: "/reconciliation",
            label: "Reconciliation",
            icon: IconRefresh,
            ownerOnly: reconciliationOwnerOnly,
          },
        ]
      : []),
    ...(canManageBackups
      ? [
          {
            href: "/backups",
            label: "Backups",
            icon: IconDatabase,
            ownerOnly: backupsOwnerOnly,
          },
        ]
      : []),
    ...(canManageQuarterlyReviews
      ? [
          {
            href: "/quarterly-reviews",
            label: "Quarterly Reviews",
            icon: IconClipboardCheck,
            ownerOnly: quarterlyReviewsOwnerOnly,
          },
        ]
      : []),
  ];

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const renderLink = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors md:py-1.5 ${
          active
            ? "bg-brand text-white"
            : "text-white/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {item.ownerOnly && (
          <span title="Owner only">
            <IconLock className="h-3 w-3 shrink-0 opacity-70" />
          </span>
        )}
      </Link>
    );
  };

  const sidebarContent = (
    // safe-top/-bottom: shared by the mobile drawer and the desktop rail,
    // so an installed PWA doesn't put the CG Ops mark under the status bar
    // or the Sign out button under the home indicator.
    <div className="safe-top safe-bottom flex h-full flex-col bg-charcoal text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-base font-semibold tracking-tight text-white">
          <span className="text-brand">CG</span> Ops
        </span>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white md:hidden"
          aria-label="Close menu"
        >
          <IconX className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        <div className="space-y-0.5">{MAIN_LINKS.map(renderLink)}</div>

        {insightsLinks.length > 0 && (
          <div>
            <p className="px-3 pb-0.5 text-xs font-semibold uppercase tracking-wider text-white/70">
              Insights &amp; Reports
            </p>
            <div className="space-y-0.5">{insightsLinks.map(renderLink)}</div>
          </div>
        )}

        {settingsLinks.length > 0 && (
          <div>
            <p className="px-3 pb-0.5 text-xs font-semibold uppercase tracking-wider text-white/70">
              Settings &amp; Tools
            </p>
            <div className="space-y-0.5">{settingsLinks.map(renderLink)}</div>
          </div>
        )}
      </nav>

      <div className="border-t border-white/15 px-4 py-3">
        <Link
          href="/settings/dashboard"
          onClick={() => setMobileOpen(false)}
          className="flex items-center justify-between gap-2 truncate text-sm text-white/80 hover:text-white"
          title="Choose what shows on your Dashboard"
        >
          <span className="truncate">{userLabel}</span>
          <IconSliders className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </Link>
        <div className="mt-2">
          <NotificationBell />
        </div>
        <form action={signOutAction} className="mt-2">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md border border-white/25 px-3 py-1 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <IconLogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar — keeps the title and menu button clear of the iOS
          status bar, which draws over the app when it's installed
          (appleWebApp.statusBarStyle is black-translucent).

          Written as arbitrary values rather than the .safe-top/.safe-x
          classes: those are unlayered CSS and so override Tailwind's
          utility layer outright, which meant they replaced this bar's
          px-4/py-3 with a 0px inset on any device without a notch, leaving
          the title flush against the edge. max() keeps the normal padding
          as the floor. */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
        <span className="text-sm font-semibold text-charcoal">
          <span className="text-brand">CG</span> Ops
        </span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <IconMenu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-charcoal/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[min(80vw,18rem)] shadow-xl">{sidebarContent}</div>
        </div>
      )}

      {/* Desktop fixed sidebar */}
      <div className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-64">
        {sidebarContent}
      </div>
    </>
  );
}
