import { Badge } from "@/components/badge";

export type AutotaskContractServiceRow = {
  id: number;
  contract_name: string;
  contract_status: string | null;
  service_name: string;
  description: string | null;
};

export function ClientAutotaskContractServices({
  companyId,
  services,
}: {
  companyId: number | null;
  services: AutotaskContractServiceRow[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Contracted services (Autotask)</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {companyId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Autotask from the Tickets tab to see its contracted services here.
          </p>
        ) : services.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No contracted services found — click &quot;Sync now&quot; on the Tickets tab, or this
            client may have no active contracts in Autotask.
          </p>
        ) : (
          services.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{s.service_name}</p>
                <p className="text-xs text-slate-500">
                  {s.contract_name}
                  {s.description ? ` · ${s.description}` : ""}
                </p>
              </div>
              {s.contract_status && <Badge value={s.contract_status} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
