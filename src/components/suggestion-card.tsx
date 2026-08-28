import Link from "next/link";
import { Badge } from "@/components/badge";
import {
  updateSuggestionStatus,
  promoteSuggestionToTask,
} from "@/app/(dashboard)/dashboard/actions";
import type { SuggestionKind, SuggestionPriority } from "@/lib/types";

export function SuggestionCard({
  id,
  clientId,
  clientName,
  kind,
  summary,
  detail,
  priority,
  members,
}: {
  id: string;
  clientId: string;
  clientName: string;
  kind: SuggestionKind;
  summary: string;
  detail: string | null;
  priority: SuggestionPriority;
  members: { id: string; full_name: string }[];
}) {
  const promote = promoteSuggestionToTask.bind(null, id, clientId, kind, summary, detail);

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {priority === "high" && <Badge value="high" />}
            <Badge value={kind} />
            <Link href={`/clients/${clientId}`} className="text-xs font-medium text-slate-500 hover:underline">
              {clientName}
            </Link>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-900">{summary}</p>
          {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <form action={updateSuggestionStatus.bind(null, id, "done")}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                Done
              </button>
            </form>
            <form action={updateSuggestionStatus.bind(null, id, "dismissed")}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Dismiss
              </button>
            </form>
          </div>
          <form
            action={async (formData: FormData) => {
              "use server";
              await promote(String(formData.get("assigned_to") ?? ""));
            }}
            className="flex items-center gap-1"
          >
            <select
              name="assigned_to"
              defaultValue=""
              required
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="" disabled>
                Assign to…
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
            >
              Assign
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
