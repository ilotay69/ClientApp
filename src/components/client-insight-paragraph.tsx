import { updateSuggestionStatus } from "@/app/(dashboard)/dashboard/actions";

export function ClientInsightParagraph({
  id,
  summary,
  detail,
  priority,
}: {
  id: string;
  summary: string;
  detail: string | null;
  priority: "high" | "normal" | "low";
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <p className="text-sm text-slate-700">
        {priority === "high" && (
          <span className="mr-1.5 font-semibold text-red-600">High —</span>
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
