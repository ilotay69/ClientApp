"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** A type-to-filter client picker — used both for choosing which client's
 * reviews to view and for picking a client when starting a new one. Plain
 * text input + dropdown list rather than a native <select>, since scrolling
 * through every client alphabetically got slow once there were enough of
 * them; typing a few letters narrows it immediately. */
export function SearchableClientSelect({
  clients,
  value,
  onChange,
  placeholder = "Search clients…",
}: {
  clients: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedName = clients.find((c) => c.id === value)?.name ?? "";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : selectedName}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">No matches.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  c.id === value ? "bg-slate-50 font-medium text-slate-900" : "text-slate-700"
                }`}
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
