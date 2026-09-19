"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import {
  CLIENT_SECTIONS,
  clientHref,
  type ClientSection,
} from "@/lib/client-workspace";
import { CGBranchedNav } from "@/components/ui/branched-nav";
import { CGSelect } from "@/components/ui/cg-select";
import { ClientViewSwitch } from "./view-switch";
import { ClientSourcePanel, type ClientSource } from "./source-panel";
import { ClientActivityComposer, type InteractionActions } from "./activity";
import { StatefulButton } from "@/components/ui/stateful-button";
import { CGActionPopover } from "@/components/ui/action-popover";
import s from "@/components/ui/client-surfaces.module.css";

export function ClientWorkspace({
  id,
  name,
  domain,
  ownerName,
  section,
  sub,
  children,
  contacts,
  clientOptions,
  sources,
  actions,
  permissions,
  errors,
  compose,
}: {
  id: string;
  name: string;
  domain: string | null;
  ownerName: string | null;
  section: ClientSection;
  sub?: string;
  children: ReactNode;
  contacts: { id: string; name: string }[];
  clientOptions: { id: string; name: string }[];
  sources: ClientSource[];
  actions: InteractionActions;
  permissions: {
    manage: boolean;
    projects: boolean;
    touchpoints: boolean;
    sales: boolean;
    mapping: boolean;
  };
  errors: string[];
  compose?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const sections = CLIENT_SECTIONS.filter(
    (s) => s.id !== "touchpoints" || permissions.touchpoints,
  );
  const current = sections.find((s) => s.id === section);
  const subtabs =
    section === "identity"
      ? [
          { value: "users", label: "MFA & sign-in" },
          { value: "access", label: "Conditional Access" },
          { value: "risky", label: "Risky users" },
          { value: "detections", label: "Risk detections" },
        ]
      : section === "intune"
        ? [
            { value: "devices", label: "Devices" },
            { value: "policies", label: "Policies" },
          ]
        : [];
  const selectedSub = subtabs.some((tab) => tab.value === sub)
    ? sub
    : subtabs[0]?.value;
  return (
    <div className={s.workspace}>
      <header className={s.header}>
        <div>
          <Link className={s.backLink} href="/clients?view=new">
            ← All clients
          </Link>
          <h1>{name}</h1>
          <p className={s.muted} style={{ marginTop: 8 }}>
            {domain || "No client domain recorded"}
            {ownerName ? ` · Account owner: ${ownerName}` : ""}
          </p>
        </div>
        <div className={s.toolbar}>
          <ClientViewSwitch view="new" />
          <ClientActivityComposer
            key={id}
            contacts={contacts}
            actions={actions}
            initialOpen={compose === "interaction"}
          />
          <CGActionPopover label="New…" title="Create for this client">
            <Link href={`/tasks?client_id=${id}&client=${id}`}>Task →</Link>
            {permissions.projects && (
              <Link href={`/projects/new?client_id=${id}`}>Project →</Link>
            )}
            {permissions.touchpoints && (
              <Link href={`/touchpoints/new?client_id=${id}`}>
                Touchpoint →
              </Link>
            )}
            {permissions.sales && (
              <Link href={`/sales-requests?client=${id}`}>Sales request →</Link>
            )}
          </CGActionPopover>
          <ClientSourcePanel
            sources={sources}
            mappingHref={
              permissions.mapping ? "/settings/client-mapping" : undefined
            }
          />
        </div>
      </header>
      <div className={s.body}>
        <aside>
          <div style={{ marginBottom: 18 }}>
            <CGSelect
              searchable
              label="Switch client"
              value={id}
              options={clientOptions.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
              onChange={(next) => router.push(clientHref(next, section, sub))}
            />
          </div>
          <CGBranchedNav
            items={sections.map((item) => ({
              ...item,
              href: clientHref(id, item.id),
            }))}
            active={section}
          />
        </aside>
        <section
          className={s.content}
          aria-label={current?.label ?? "Client information"}
        >
          <div className={s.sectionHeader}>
            <h2>{current?.label}</h2>
            {section === "overview" && permissions.manage && (
              <Link className={s.button} href={clientHref(id, "settings")}>
                Edit client details
              </Link>
            )}
          </div>
          {subtabs.length > 0 && (
            <nav className={s.subnav} aria-label={`${current?.label} sections`}>
              {subtabs.map((tab) => (
                <Link
                  key={tab.value}
                  href={clientHref(id, section, tab.value)}
                  scroll={false}
                  prefetch={false}
                  aria-current={selectedSub === tab.value ? "page" : undefined}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          )}
          {errors.length > 0 && (
            <div className={s.error} role="alert">
              <p>
                Some information is unavailable: {errors.join(", ")}. Missing
                data is not shown as a healthy result.
              </p>
              <StatefulButton
                className={s.button}
                status={pending ? "pending" : "idle"}
                pendingLabel="Loading…"
                onClick={() => startTransition(() => router.refresh())}
              >
                Retry loading
              </StatefulButton>
            </div>
          )}
          <div className={s.technical}>{children}</div>
        </section>
      </div>
    </div>
  );
}
