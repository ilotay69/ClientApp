"use client";

import { useRouter } from "next/navigation";

export function QuarterlyReviewClientPicker({
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
      onChange={(e) => router.push(`/quarterly-reviews?client_id=${e.target.value}`)}
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
