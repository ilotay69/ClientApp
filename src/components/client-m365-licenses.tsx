import { Badge } from "@/components/badge";

export type M365LicenseRow = {
  id: number;
  sku_part_number: string;
  consumed_units: number;
  enabled_units: number;
};

export function ClientM365Licenses({
  tenantId,
  licenses,
}: {
  tenantId: string | null;
  licenses: M365LicenseRow[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Microsoft 365 licenses</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            license usage here.
          </p>
        ) : licenses.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No license data found — click &quot;Sync M365&quot; at the top of the page.
          </p>
        ) : (
          licenses.map((l) => {
            const noHeadroom = l.consumed_units >= l.enabled_units;
            return (
              <div key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <p className="text-sm font-medium text-slate-900">{l.sku_part_number}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    {l.consumed_units} / {l.enabled_units} used
                  </span>
                  {noHeadroom && <Badge value="high" />}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
