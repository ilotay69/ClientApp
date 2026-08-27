import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TouchpointForm } from "@/components/touchpoint-form";
import { DeleteButton } from "@/components/delete-button";
import { formatDate } from "@/lib/format";
import {
  updateTouchpoint,
  deleteTouchpoint,
  toggleTouchpointComplete,
} from "../actions";

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
    </div>
  );
}
