"use client";

import { useRouter } from "next/navigation";

/** Plain navigation on change, same "select and reload" pattern as other
 * server-rendered filter pickers in this app — no client-side data fetching
 * of its own, the page itself re-renders server-side with the new client_id. */
export function ClientPicker({
  clients,
  selectedId,
}: {
  clients: { id: string; name: string }[];
  selectedId: string | null;
}) {
  const router = useRouter();
  return (
    <select
      defaultValue={selectedId ?? ""}
      onChange={(e) => router.push(`/reconciliation/licenses?client_id=${e.target.value}`)}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
    >
      <option value="" disabled>
        Choose a client…
      </option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
