import Link from "next/link";
import { updateSuggestionStatus } from "@/app/(dashboard)/dashboard/actions";

export function ClientInsightParagraph({
  id,
  summary,
  detail,
  priority,
  clientId,
  clientName,
}: {
  id: string;
  summary: string;
  detail: string | null;
  priority: "high" | "normal" | "low";
  /** Only passed on the Overview page, where insights span every client —
   * omitted on a client's own page, where it'd be redundant. */
  clientId?: string;
  clientName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <p className="text-sm text-slate-700">
        {priority === "high" && (
          <span className="mr-1.5 font-semibold text-red-600">High —</span>
        )}
        {clientId && clientName && (
          <Link href={`/clients/${clientId}`} className="mr-1.5 font-medium text-slate-500 hover:underline">
            {clientName}:
          </Link>
        )}
        {summary}
        {detail && <span className="text-slate-500"> {detail}</span>}
      </p>
      <form action={updateSuggestionStatus.bind(null, id, "dismissed")} className="shrink-0">
        <button
          type="submit"
          className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
        >
          Dismiss
        </button>
      </form>
    </div>
  );
}
