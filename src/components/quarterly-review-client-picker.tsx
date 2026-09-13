"use client";

import { useRouter } from "next/navigation";
import { SearchableClientSelect } from "@/components/searchable-client-select";

export function QuarterlyReviewClientPicker({
  clients,
  selectedId,
  tab,
}: {
  clients: { id: string; name: string }[];
  selectedId: string | null;
  tab?: string;
}) {
  const router = useRouter();
  return (
    <SearchableClientSelect
      clients={clients}
      value={selectedId}
      onChange={(id) => router.push(`/quarterly-reviews?client_id=${id}${tab ? `&tab=${tab}` : ""}`)}
      placeholder="Search clients…"
    />
  );
}
