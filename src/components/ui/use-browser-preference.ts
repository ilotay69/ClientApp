"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";

const memory = new Map<string, string>();
/** Only non-sensitive display preferences belong here, scoped to a user. */
export function useBrowserPreference<T>(
  key: string,
  initial: T,
): [T, (value: T) => void] {
  const fallback = JSON.stringify(initial);
  const subscribe = useCallback(
    (changed: () => void) => {
      const storage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) changed();
      };
      const local = () => changed();
      window.addEventListener("storage", storage);
      window.addEventListener("cg-display-preference", local);
      return () => {
        window.removeEventListener("storage", storage);
        window.removeEventListener("cg-display-preference", local);
      };
    },
    [key],
  );
  const snapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) ?? memory.get(key) ?? fallback;
    } catch {
      return memory.get(key) ?? fallback;
    }
  }, [key, fallback]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => fallback);
  const value = useMemo(() => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return JSON.parse(fallback) as T;
    }
  }, [raw, fallback]);
  const save = useCallback(
    (next: T) => {
      const serialized = JSON.stringify(next);
      memory.set(key, serialized);
      try {
        localStorage.setItem(key, serialized);
      } catch {
        /* Keep the preference for this session when storage is blocked. */
      }
      window.dispatchEvent(new Event("cg-display-preference"));
    },
    [key],
  );
  return [value, save];
}
