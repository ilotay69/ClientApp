"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ClientOption = { id: string; name: string };
type SpecialOption = { value: string; label: string };

/** Type-to-filter client picker — replaces a plain <select> everywhere a
 * client list can run into the dozens/hundreds, where scrolling a native
 * dropdown to find one by eye is slow. Controlled the same way a <select>
 * is (value/onChange by client id), so it drops into any existing picker
 * without changing how the parent tracks selection. */
export function ClientCombobox({
  clients,
  value,
  onChange,
  placeholder = "Type a client name…",
  emptyLabel,
  extraOptions,
  disabled,
  className = "",
}: {
  clients: ClientOption[] | null | undefined;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** When set, shown as a selectable "no client" / "all clients" option
   * (value "") at the top of the suggestion list — for a filter bar or an
   * optional relation, not a picker where some client must be chosen. */
  emptyLabel?: string;
  /** Additional non-client options shown alongside emptyLabel, each with
   * its own arbitrary value — e.g. a sales-request filter's "Internal
   * only" (value "none"), which isn't a client id but still needs to be
   * pickable the same way. */
  extraOptions?: SpecialOption[];
  disabled?: boolean;
  className?: string;
}) {
  const loading = clients == null;
  const list = useMemo(() => clients ?? [], [clients]);
  const specialOptions = useMemo<SpecialOption[]>(() => {
    const opts: SpecialOption[] = [];
    if (emptyLabel != null) opts.push({ value: "", label: emptyLabel });
    if (extraOptions) opts.push(...extraOptions);
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emptyLabel, extraOptions]);

  // What the input shows for the current value when nothing's being
  // actively typed — the selected client's name, or a special option's own
  // label (e.g. "No client (internal)") so an unset/special value reads
  // the same way a native <select>'s chosen option would, not as blank.
  const displayValue = (v: string) =>
    specialOptions.find((o) => o.value === v)?.label ?? list.find((c) => c.id === v)?.name ?? "";

  const [query, setQuery] = useState(displayValue(value));
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keeps the input's text in sync when `value` changes from outside (a
  // parent resetting the filter, or a default id arriving once clients
  // load) — but not while the dropdown is open, so a user's own keystrokes
  // never get clobbered mid-search.
  useEffect(() => {
    if (open) return;
    setQuery(displayValue(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open, list, specialOptions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => {
    const filtered = trimmedQuery
      ? list.filter((c) => c.name.toLowerCase().includes(trimmedQuery))
      : list;
    return filtered.slice(0, 50);
  }, [list, trimmedQuery]);
  const matchingSpecial = useMemo(
    () => specialOptions.filter((o) => !trimmedQuery || o.label.toLowerCase().includes(trimmedQuery)),
    [specialOptions, trimmedQuery]
  );
  const optionCount = matchingSpecial.length + matches.length;

  const selectOption = (v: string, label: string) => {
    onChange(v);
    setQuery(label);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, optionCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted < matchingSpecial.length) {
        const special = matchingSpecial[highlighted];
        if (special) selectOption(special.value, special.label);
        return;
      }
      const match = matches[highlighted - matchingSpecial.length];
      if (match) selectOption(match.id, match.name);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        disabled={disabled || loading}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          setHighlighted(0);
          // The moment the typed text no longer matches the current
          // selection (or special option), clear it — otherwise a
          // half-edited query could still silently carry the old value
          // through to submit.
          const currentLabel = displayValue(value);
          if (currentLabel && next !== currentLabel) {
            onChange("");
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? "Loading clients…" : placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
      {open && !loading && optionCount > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {matchingSpecial.map((o, i) => (
            <button
              key={o.value || "__empty__"}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectOption(o.value, o.label)}
              className={`block w-full px-3 py-1.5 text-left text-sm ${
                highlighted === i ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              {o.label}
            </button>
          ))}
          {matches.map((c, i) => {
            const idx = matchingSpecial.length + i;
            return (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(c.id, c.name)}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
                  highlighted === idx ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
