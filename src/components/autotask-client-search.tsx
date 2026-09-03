"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AutotaskCompany } from "@/lib/autotask";

// Search Autotask directly and create the client from the match in one
// click — instead of typing a new client's name by hand here, then
// separately hunting down and linking its Autotask company afterward from
// the client's own page.
export function AutotaskClientSearch({
  searchAction,
  createAction,
}: {
  searchAction: (query: string) => Promise<{ companies: AutotaskCompany[] } | { error: string }>;
  createAction: (company: AutotaskCompany) => Promise<{ clientId: string } | { error: string }>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AutotaskCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [creatingId, setCreatingId] = useState<number | null>(null);
  const [creating, startCreate] = useTransition();

  const runSearch = () => {
    setError(null);
    startSearch(async () => {
      const result = await searchAction(query);
      if ("error" in result) {
        setError(result.error);
        setResults(null);
      } else {
        setResults(result.companies);
      }
    });
  };

  const create = (company: AutotaskCompany) => {
    setError(null);
    setCreatingId(company.id);
    startCreate(async () => {
      const result = await createAction(company);
      if ("error" in result) {
        setError(result.error);
        setCreatingId(null);
      } else {
        router.push(`/clients/${result.clientId}`);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Add from Autotask</h2>
      <p className="mt-1 text-sm text-slate-500">
        Search for the company in Autotask and add it here in one click — no need to also fill in
        the form below.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Company name"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={searching || !query.trim()}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {results && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-100">
          {results.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm text-slate-900">{c.companyName}</span>
              <button
                type="button"
                disabled={creating}
                onClick={() => create(c)}
                className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {creating && creatingId === c.id ? "Adding…" : "Add to this app"}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">No matching companies found.</li>
          )}
        </ul>
      )}
    </div>
  );
}
