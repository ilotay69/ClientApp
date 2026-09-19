"use client";

import { useId, useState } from "react";
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
  IconNetwork,
  IconChevronDown,
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

type NavSection = {
  id: string;
  label: string;
  icon: NavItem["icon"];
  links: NavItem[];
};

function CollapsibleNavSection({
  label,
  icon: Icon,
  links,
  isOpen,
  onToggle,
  activeLabel,
  renderLink,
}: {
  label: string;
  icon: NavItem["icon"];
  links: NavItem[];
  isOpen: boolean;
  onToggle: () => void;
  activeLabel?: string;
  renderLink: (item: NavItem) => React.ReactNode;
}) {
  const contentId = useId();

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 md:py-2.5 ${
          activeLabel ? "bg-white/10 text-white" : "text-white/70"
        }`}
      >
        <span aria-hidden="true"><Icon className="h-4 w-4 shrink-0" /></span>
        <span className="flex-1">{label}</span>
        {activeLabel && (
          <>
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span className="sr-only">Current page: {activeLabel}</span>
          </>
        )}
        <span aria-hidden="true">
          <IconChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${
              isOpen ? "rotate-0" : "-rotate-90"
            }`}
          />
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div
          id={contentId}
          aria-hidden={!isOpen}
          inert={!isOpen}
          className="min-h-0 overflow-hidden"
        >
          <div
            className={`ml-5 space-y-0.5 border-l border-white/15 pl-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
              isOpen ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
            }`}
          >
            {links.map(renderLink)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SidebarNav({
  userLabel,
  canManageIntegrations,
  canManageClientMapping,
  canManageTeam,
  canViewReports,
  canManageTouchpoints,
  canViewDomainHealth,
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
  clientMappingOwnerOnly,
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
  canManageClientMapping: boolean;
  canManageTeam: boolean;
  canViewReports: boolean;
  canManageTouchpoints: boolean;
  canViewDomainHealth: boolean;
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
  clientMappingOwnerOnly: boolean;
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
  // One shared accordion for desktop and mobile. A new authenticated layout
  // starts closed; client-side navigation keeps the user's current section.
  const [openSection, setOpenSection] = useState<string | null>(null);

  // My To-Do is the one link always shown regardless of permission — it's
  // a signed-in user's own list (tasks, mailbox analysis, tickets), never
  // gated. Tasks (the team-wide list) requires view_team_tasks like every
  // other link here.
  const quickLinks: NavItem[] = [
    ...(canViewDashboard ? [{ href: "/dashboard", label: "Dashboard", icon: IconGrid }] : []),
    { href: "/my-todo", label: "My To-Do", icon: IconCheckSquare },
  ];

  const clientLinks: NavItem[] = [
    ...(canViewClients ? [{ href: "/clients", label: "Clients", icon: IconBriefcase }] : []),
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
    ...(canManageQuarterlyReviews
      ? [{ href: "/quarterly-reviews", label: "Quarterly Reviews", icon: IconClipboardCheck, ownerOnly: quarterlyReviewsOwnerOnly }]
      : []),
  ];

  const serviceLinks: NavItem[] = [
    ...(canViewTeamTasks ? [{ href: "/tasks", label: "Tasks", icon: IconList }] : []),
    ...(canViewProjects ? [{ href: "/projects", label: "Projects", icon: IconFolder }] : []),
  ];

  const operationsLinks: NavItem[] = [
    ...(canManageBackups
      ? [{ href: "/backups", label: "Daily Backup Reports", icon: IconDatabase, ownerOnly: backupsOwnerOnly }]
      : []),
    ...(canViewDomainHealth
      ? [{ href: "/domain-health", label: "Network Tools", icon: IconGlobe, ownerOnly: domainHealthOwnerOnly }]
      : []),
  ];

  const salesLinks: NavItem[] = [
    ...(canViewSalesRequests
      ? [{ href: "/sales-requests", label: "Internal Sales", icon: IconTag }]
      : []),
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
    ...(canManageReconciliation
      ? [{ href: "/reconciliation", label: "Reconciliation", icon: IconRefresh, ownerOnly: reconciliationOwnerOnly }]
      : []),
  ];

  const insightsLinks: NavItem[] = [
    ...(canViewReports ? [{ href: "/reports", label: "Reports", icon: IconDownload }] : []),
    ...(canViewAnalysis ? [{ href: "/settings/catalog", label: "Analysis", icon: IconList }] : []),
  ];

  const peopleLinks: NavItem[] = [
    ...(canManageTeam
      ? [{ href: "/team", label: "Team", icon: IconUsers, ownerOnly: teamOwnerOnly }]
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
    { href: "/settings/profile", label: "My Profile", icon: IconUser },
    { href: "/settings/mail", label: "Mailbox", icon: IconMail },
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
    // Its own permission, separate from manage_integrations — onboarding
    // a new client (linking their NinjaOne org/M365 tenant/Huntress org)
    // is a frequent task that shouldn't require also being trusted with
    // API keys and AI provider settings.
    ...(canManageClientMapping
      ? [
          {
            href: "/settings/client-mapping",
            label: "Client Mapping",
            icon: IconNetwork,
            ownerOnly: clientMappingOwnerOnly,
          },
        ]
      : []),
  ];

  // Group by workflow rather than vendor. Planned destinations and placement
  // rules live in docs/sidebar-navigation.md; only working routes appear here.
  const sections: NavSection[] = [
    { id: "clients", label: "Clients & Knowledge", icon: IconBriefcase, links: clientLinks },
    { id: "service", label: "Service Delivery", icon: IconFolder, links: serviceLinks },
    { id: "operations", label: "IT Operations", icon: IconGlobe, links: operationsLinks },
    { id: "sales", label: "Sales & Finance", icon: IconTag, links: salesLinks },
    { id: "insights", label: "Reports & Analysis", icon: IconDownload, links: insightsLinks },
    { id: "people", label: "People & Team", icon: IconUsers, links: peopleLinks },
    { id: "settings", label: "Settings", icon: IconSliders, links: settingsLinks },
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
    <div className="safe-top safe-bottom flex h-full min-h-0 w-full flex-col bg-charcoal text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cg-mark.svg" alt="" className="h-6 w-6 shrink-0" />
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

      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        <div className="space-y-0.5">{quickLinks.map(renderLink)}</div>
        <div className="space-y-1 border-t border-white/15 pt-3">
          {sections.filter((section) => section.links.length > 0).map((section) => (
            <CollapsibleNavSection
              key={section.id}
              label={section.label}
              icon={section.icon}
              links={section.links}
              isOpen={openSection === section.id}
              onToggle={() => setOpenSection((current) => current === section.id ? null : section.id)}
              activeLabel={section.links.find((link) => isActive(link.href))?.label}
              renderLink={renderLink}
            />
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-white/15 px-4 py-3">
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
      <div className="sticky top-[var(--env-banner-height)] z-30 flex items-center justify-between border-b border-slate-200 bg-white pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-charcoal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cg-mark.svg" alt="" className="h-5 w-5 shrink-0" />
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
        <div className="fixed inset-x-0 bottom-0 top-[var(--env-banner-height)] z-40 md:hidden">
          <div
            className="absolute inset-0 bg-charcoal/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[min(80vw,18rem)] shadow-xl">{sidebarContent}</div>
        </div>
      )}

      {/* Desktop fixed sidebar */}
      <div className="hidden md:fixed md:bottom-0 md:top-[var(--env-banner-height)] md:left-0 md:z-30 md:flex md:w-64">
        {sidebarContent}
      </div>
    </>
  );
}
