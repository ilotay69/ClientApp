import { Badge } from "@/components/badge";

export type M365SecureScoreSummaryRow = {
  current_score: number;
  max_score: number;
};

export type M365SecureScoreGapRow = {
  id: number;
  control_name: string;
  title: string | null;
  category: string | null;
  current_score: number;
  max_score: number | null;
  remediation: string | null;
  action_url: string | null;
  implementation_cost: string | null;
};

export function ClientM365SecureScore({
  tenantId,
  summary,
  gaps,
}: {
  tenantId: string | null;
  summary: M365SecureScoreSummaryRow | null;
  gaps: M365SecureScoreGapRow[];
}) {
  const percent = summary ? Math.round((summary.current_score / summary.max_score) * 100) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Microsoft Secure Score</h2>
        {summary && (
          <span className="text-sm font-medium text-slate-700">
            {summary.current_score} / {summary.max_score} ({percent}%)
          </span>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            Secure Score here.
          </p>
        ) : !summary ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No Secure Score data found — click &quot;Sync M365&quot; at the top of the page.
          </p>
        ) : gaps.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No outstanding gaps — every scored control is fully implemented.
          </p>
        ) : (
          gaps.map((g) => (
            <div key={g.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{g.title ?? g.control_name}</p>
                  {g.remediation && (
                    <p className="mt-1 text-xs text-slate-500">{g.remediation}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {g.category && <Badge value={g.category.toLowerCase()} />}
                  <span className="text-xs text-slate-500">
                    {g.current_score}/{g.max_score} pts
                  </span>
                </div>
              </div>
              {g.action_url && (
                <a
                  href={g.action_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                >
                  Fix in admin center →
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
