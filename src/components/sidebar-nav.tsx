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
  IconList,
  IconSparkles,
  IconTag,
  IconUsers,
  IconClock,
  IconDownload,
  IconGlobe,
  IconLogOut,
  IconMenu,
  IconX,
  IconLock,
} from "@/components/icons";

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

const LINKS_BEFORE_TOUCHPOINTS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: IconGrid },
  { href: "/tasks", label: "Tasks", icon: IconCheckSquare },
  { href: "/clients", label: "Clients", icon: IconBriefcase },
  { href: "/projects", label: "Projects", icon: IconFolder },
];
const LINKS_AFTER_TOUCHPOINTS: NavItem[] = [
  { href: "/sales-requests", label: "Internal Sales", icon: IconTag },
];

export function SidebarNav({
  userLabel,
  canManageServices,
  canManageIntegrations,
  canManageTeam,
  canViewReports,
  canManageTouchpoints,
  canViewDomainHealth,
  teamOwnerOnly,
  integrationsOwnerOnly,
  touchpointsOwnerOnly,
  domainHealthOwnerOnly,
  signOutAction,
}: {
  userLabel: string;
  canManageServices: boolean;
  canManageIntegrations: boolean;
  canManageTeam: boolean;
  canViewReports: boolean;
  canManageTouchpoints: boolean;
  canViewDomainHealth: boolean;
  /** True only while no non-Owner role has been granted the permission —
   * disappears on its own once one is (see isPermissionOwnerOnly). */
  teamOwnerOnly: boolean;
  integrationsOwnerOnly: boolean;
  touchpointsOwnerOnly: boolean;
  domainHealthOwnerOnly: boolean;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Touchpoints is a relationship-contact log gated by manage_touchpoints —
  // no point linking to a page that'll just redirect back out.
  const MAIN_LINKS: NavItem[] = [
    ...LINKS_BEFORE_TOUCHPOINTS,
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
    ...LINKS_AFTER_TOUCHPOINTS,
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
    ...(canManageTeam ? [{ href: "/hours", label: "Lookups", icon: IconClock }] : []),
    ...(canViewReports ? [{ href: "/reports", label: "Reports", icon: IconDownload }] : []),
    ...(canManageServices
      ? [{ href: "/settings/catalog", label: "Analysis", icon: IconList }]
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
        className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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
    <div className="flex h-full flex-col bg-charcoal text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-base font-semibold tracking-tight text-white">
          <span className="text-brand">CG</span> Client Tracker
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
        <p className="truncate text-sm text-white/80">{userLabel}</p>
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
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <span className="text-sm font-semibold text-charcoal">
          <span className="text-brand">CG</span> Client Tracker
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
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebarContent}</div>
        </div>
      )}

      {/* Desktop fixed sidebar */}
      <div className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-64">
        {sidebarContent}
      </div>
    </>
  );
}
