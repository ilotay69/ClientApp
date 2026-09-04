import { DomainHealthPanel } from "@/components/domain-health-panel";
import { checkDomainHealthAction } from "./actions";

export default function DomainHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Domain Health</h1>
        <p className="mt-1 text-sm text-slate-500">
          Check any domain&apos;s DNS, MX, SPF, DMARC, DKIM, and registration/expiration — not
          limited to existing clients.
        </p>
      </div>

      <DomainHealthPanel action={checkDomainHealthAction} title="Check a domain" />
    </div>
  );
}
