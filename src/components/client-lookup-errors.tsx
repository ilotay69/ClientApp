import type { ClientLookupError } from "@/lib/m365-lookups";

/** Shared by every M365 rollup lookup — a per-client credentials call can
 * fail independently of the others (most commonly: the Graph permission
 * this lookup needs isn't consented on that client's app registration
 * yet), so failures are shown alongside whatever data did come back
 * rather than blanking the whole page. */
export function ClientLookupErrors({ errors }: { errors: ClientLookupError[] }) {
  if (errors.length === 0) return null;
  return (
    <details className="border-b border-slate-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">
      <summary className="cursor-pointer font-medium">
        {errors.length} client{errors.length === 1 ? "" : "s"} couldn&apos;t be checked
      </summary>
      <ul className="mt-1 space-y-0.5 pl-4">
        {errors.map((e) => (
          <li key={e.clientId}>
            <span className="font-medium">{e.clientName}:</span> {e.error}
          </li>
        ))}
      </ul>
    </details>
  );
}
