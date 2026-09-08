"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  IconGrid,
  IconClock,
  IconList,
  IconLock,
  IconTag,
  IconLogOut,
  IconMenu,
  IconX,
} from "@/components/icons";

const LINKS: {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
}[] = [
  { href: "/portal", label: "Overview", icon: IconGrid },
  { href: "/portal/contracts", label: "Contract hours", icon: IconClock },
  { href: "/portal/devices", label: "Devices", icon: IconList },
  { href: "/portal/security", label: "Security", icon: IconLock },
  { href: "/portal/licences", label: "Microsoft 365", icon: IconTag },
];

export function PortalNav({
  companyName,
  signOutAction,
}: {
  companyName: string;
  signOutAction: () => Promise<void>;
}) {
  return (
    // useSearchParams needs a Suspense boundary to keep the rest of the
    // layout from opting into client-side rendering wholesale.
    <Suspense fallback={null}>
      <PortalNavInner companyName={companyName} signOutAction={signOutAction} />
    </Suspense>
  );
}

function PortalNavInner({
  companyName,
  signOutAction,
}: {
  companyName: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Carry ?preview= across navigation so a staff member previewing a client's
  // portal doesn't drop out of preview on the first click. It's only ever
  // honoured server-side after the role has been confirmed as staff (see
  // getPortalContext), so passing it around in the UI grants nothing.
  const preview = searchParams.get("preview");
  const href = (base: string) => (preview ? `${base}?preview=${preview}` : base);

  const items = (
    <>
      {LINKS.map((link) => {
        const active =
          link.href === "/portal" ? pathname === "/portal" : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={href(link.href)}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
              active ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <span className="text-sm font-semibold text-slate-900">{companyName}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
        >
          {open ? <IconX className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="space-y-1 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          {items}
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <IconLogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </nav>
      )}

      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex">
        <div className="px-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            CG Technologies
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900" title={companyName}>
            {companyName}
          </p>
        </div>

        <nav className="mt-6 flex-1 space-y-1">{items}</nav>

        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <IconLogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </aside>
    </>
  );
}
