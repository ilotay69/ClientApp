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
  IconRefresh,
  IconList,
  IconSparkles,
  IconUsers,
  IconClock,
  IconDownload,
  IconLogOut,
  IconMenu,
  IconX,
} from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
};

const MAIN_LINKS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: IconGrid },
  { href: "/tasks", label: "Tasks", icon: IconCheckSquare },
  { href: "/clients", label: "Clients", icon: IconBriefcase },
  { href: "/projects", label: "Projects", icon: IconFolder },
  { href: "/touchpoints", label: "Touchpoints", icon: IconCalendar },
];

export function SidebarNav({
  userLabel,
  canManageServiceCatalog,
  canManageServices,
  canManageIntegrations,
  canManageTeam,
  canViewReports,
  signOutAction,
}: {
  userLabel: string;
  canManageServiceCatalog: boolean;
  canManageServices: boolean;
  canManageIntegrations: boolean;
  canManageTeam: boolean;
  canViewReports: boolean;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const settingsLinks: NavItem[] = [
    ...(canManageServiceCatalog
      ? [{ href: "/settings/services", label: "Recurring Services", icon: IconRefresh }]
      : []),
    ...(canManageServices
      ? [{ href: "/settings/catalog", label: "Analysis", icon: IconList }]
      : []),
    ...(canManageIntegrations
      ? [{ href: "/settings/integrations", label: "Integrations", icon: IconSparkles }]
      : []),
    // Sits under Integrations since it's the same kind of setting, but stays
    // its own link — the mailbox connection is per-user and ungated, unlike
    // the Integrations page, which requires manage_integrations.
    { href: "/settings/mail", label: "Mailbox", icon: IconMail },
  ];

  const adminLinks: NavItem[] = [
    ...(canManageTeam
      ? [
          { href: "/team", label: "Team", icon: IconUsers },
          { href: "/hours", label: "Hours", icon: IconClock },
        ]
      : []),
    ...(canViewReports ? [{ href: "/reports", label: "Reports", icon: IconDownload }] : []),
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
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-brand text-white"
            : "text-white/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {item.label}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-charcoal text-white">
      <div className="flex items-center justify-between px-4 py-5">
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

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        <div className="space-y-1">{MAIN_LINKS.map(renderLink)}</div>

        {settingsLinks.length > 0 && (
          <div>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-white/70">
              Settings
            </p>
            <div className="space-y-1">{settingsLinks.map(renderLink)}</div>
          </div>
        )}

        {adminLinks.length > 0 && (
          <div>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-white/70">
              Admin
            </p>
            <div className="space-y-1">{adminLinks.map(renderLink)}</div>
          </div>
        )}
      </nav>

      <div className="border-t border-white/15 px-4 py-4">
        <p className="truncate text-sm text-white/80">{userLabel}</p>
        <form action={signOutAction} className="mt-2">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md border border-white/25 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white"
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
