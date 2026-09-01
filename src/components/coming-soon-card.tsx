export function ComingSoonCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 shadow-sm">
      <div className="border-b border-dashed border-slate-300 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-slate-500">{description}</p>
        <span className="mt-2 inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          Not connected yet
        </span>
      </div>
    </div>
  );
}
