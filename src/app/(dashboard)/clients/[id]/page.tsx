import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientForm } from "@/components/client-form";
import { Badge, OverdueBadge } from "@/components/badge";
import { formatCurrency, formatDate, isOverdue } from "@/lib/format";
import { updateClientRecord, deleteClientRecord } from "../actions";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: quotes }, { data: projects }, { data: touchpoints }, { data: emails }] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", id).single(),
      supabase
        .from("quotes")
        .select("id, title, status, amount, follow_up_due_date")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("projects")
        .select("id, name, status, target_end_date")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("touchpoints")
        .select("id, type, due_date, completed_at")
        .eq("client_id", id)
        .order("due_date", { ascending: false }),
      supabase
        .from("email_links")
        .select("id, type, subject, from_name, from_email, received_at, web_link")
        .eq("client_id", id)
        .order("received_at", { ascending: false })
        .limit(20),
    ]);

  if (!client) notFound();

  const updateAction = updateClientRecord.bind(null, id);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/clients" className="text-sm text-slate-500 hover:underline">
            ← All clients
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {client.name}
          </h1>
        </div>
        <DeleteButton
          action={deleteClientRecord.bind(null, id)}
          confirmText={`Delete ${client.name}? This also removes their quotes, projects, and touchpoints.`}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Client details
          </h2>
          <ClientForm client={client} action={updateAction} submitLabel="Save changes" />
        </div>

        <div className="space-y-6">
          <RelatedSection
            title="Quotes"
            newHref={`/quotes/new?client_id=${id}`}
            emptyText="No quotes yet."
          >
            {(quotes ?? []).map((q) => (
              <Link
                key={q.id}
                href={`/quotes/${q.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{q.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatCurrency(q.amount)} · due {formatDate(q.follow_up_due_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isOverdue(q.follow_up_due_date) && <OverdueBadge />}
                  <Badge value={q.status} />
                </div>
              </Link>
            ))}
          </RelatedSection>

          <RelatedSection
            title="Projects"
            newHref={`/projects/new?client_id=${id}`}
            emptyText="No projects yet."
          >
            {(projects ?? []).map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    Target {formatDate(p.target_end_date)}
                  </p>
                </div>
                <Badge value={p.status} />
              </Link>
            ))}
          </RelatedSection>

          <RelatedSection
            title="Touchpoints"
            newHref={`/touchpoints/new?client_id=${id}`}
            emptyText="No touchpoints scheduled."
          >
            {(touchpoints ?? []).map((t) => (
              <Link
                key={t.id}
                href={`/touchpoints/${t.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {formatDate(t.due_date)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t.completed_at ? `Completed ${formatDate(t.completed_at)}` : "Not completed"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!t.completed_at && isOverdue(t.due_date) && <OverdueBadge />}
                  <Badge value={t.type} />
                </div>
              </Link>
            ))}
          </RelatedSection>

          <RelatedSection title="Linked emails" emptyText="No matching emails yet.">
            {(emails ?? []).map((e) => (
              <a
                key={e.id}
                href={e.web_link ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{e.subject}</p>
                  <p className="text-xs text-slate-500">
                    {e.from_name ?? e.from_email} · {formatDate(e.received_at)}
                  </p>
                </div>
                <Badge value={e.type} />
              </a>
            ))}
          </RelatedSection>
        </div>
      </div>
    </div>
  );
}

function RelatedSection({
  title,
  newHref,
  emptyText,
  children,
}: {
  title: string;
  newHref?: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {newHref && (
          <Link href={newHref} className="text-sm text-slate-600 hover:underline">
            + Add
          </Link>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {hasChildren ? children : (
          <p className="px-5 py-4 text-sm text-slate-500">{emptyText}</p>
        )}
      </div>
    </div>
  );
}
