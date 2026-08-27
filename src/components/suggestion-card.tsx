import Link from "next/link";
import { Badge } from "@/components/badge";
import { updateSuggestionStatus } from "@/app/(dashboard)/dashboard/actions";
import type { SuggestionKind } from "@/lib/types";

export function SuggestionCard({
  id,
  clientId,
  clientName,
  kind,
  summary,
  detail,
}: {
  id: string;
  clientId: string;
  clientName: string;
  kind: SuggestionKind;
  summary: string;
  detail: string | null;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge value={kind} />
            <Link href={`/clients/${clientId}`} className="text-xs font-medium text-slate-500 hover:underline">
              {clientName}
            </Link>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-900">{summary}</p>
          {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
      </div>
    </div>
  );
}
