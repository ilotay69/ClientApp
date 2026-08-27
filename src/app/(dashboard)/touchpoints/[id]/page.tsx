import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TouchpointForm } from "@/components/touchpoint-form";
import { DeleteButton } from "@/components/delete-button";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import {
  updateTouchpoint,
  deleteTouchpoint,
  toggleTouchpointComplete,
} from "../actions";

const RELATED_EMAIL_WINDOW_DAYS = 14;

export const dynamic = "force-dynamic";

export default async function TouchpointDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: touchpoint }, { data: clients }] = await Promise.all([
    supabase.from("touchpoints").select("*, clients(name)").eq("id", id).single(),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  if (!touchpoint) notFound();

  const clientName = (touchpoint.clients as unknown as { name: string } | null)?.name;

  const windowMs = RELATED_EMAIL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const dueDate = new Date(touchpoint.due_date);
  const windowStart = new Date(dueDate.getTime() - windowMs).toISOString();
  const windowEnd = new Date(dueDate.getTime() + windowMs).toISOString();

  const { data: relatedEmails } = await supabase
    .from("email_links")
    .select("id, subject, from_name, from_email, received_at, web_link, type")
    .eq("client_id", touchpoint.client_id)
    .gte("received_at", windowStart)
    .lte("received_at", windowEnd)
    .order("received_at", { ascending: false })
    .limit(15);
  const updateAction = updateTouchpoint.bind(null, id, touchpoint.client_id);
  const toggleAction = toggleTouchpointComplete.bind(
    null,
    id,
    touchpoint.client_id,
    !touchpoint.completed_at
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/touchpoints" className="text-sm text-slate-500 hover:underline">
            ← All touchpoints
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {clientName ?? "Touchpoint"}
          </h1>
          <p className="text-sm text-slate-500">
            {touchpoint.completed_at
              ? `Completed ${formatDate(touchpoint.completed_at)}`
              : "Not completed"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={toggleAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              {touchpoint.completed_at ? "Mark not completed" : "Mark completed"}
            </button>
          </form>
          <DeleteButton
            action={deleteTouchpoint.bind(null, id, touchpoint.client_id)}
            confirmText="Delete this touchpoint?"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <TouchpointForm
          touchpoint={touchpoint}
          clients={clients ?? []}
          action={updateAction}
          submitLabel="Save changes"
        />
      </div>

      <div className="max-w-xl rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Related emails ({RELATED_EMAIL_WINDOW_DAYS} days either side of the due date)
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {(relatedEmails ?? []).length > 0 ? (
            (relatedEmails ?? []).map((e) => (
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
            ))
          ) : (
            <p className="px-5 py-4 text-sm text-slate-500">
              No emails found in that window — connect a mailbox on the
              Mailbox settings page if you haven&apos;t yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
