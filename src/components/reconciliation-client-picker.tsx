"use client";

import { useRouter } from "next/navigation";
import { ClientCombobox } from "@/components/client-combobox";

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
    <ClientCombobox
      clients={clients}
      value={selectedId ?? ""}
      // Only navigates on an actual pick (a truthy id) — the combobox also
      // fires onChange("") the moment typed text stops matching the
      // current selection, which would otherwise re-navigate to "no
      // client" on every keystroke of a fresh search.
      onChange={(id) => {
        if (id) router.push(`/reconciliation/licenses?client_id=${id}`);
      }}
      className="w-full"
    />
  );
}
