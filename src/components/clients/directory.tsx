"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClientViewSwitch } from "./view-switch";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import { AnimatedDialog } from "@/components/ui/animated-dialog";
import {
  StatefulButton,
  useActionFeedback,
} from "@/components/ui/stateful-button";
import { clientHref } from "@/lib/client-workspace";
import { useBrowserPreference } from "@/components/ui/use-browser-preference";
import s from "@/components/ui/client-surfaces.module.css";

export type ClientPreview = {
  name: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  address: string | null;
};
export function ClientDirectory({
  clients,
  userId,
  canManage,
  error,
  previewAction,
}: {
  clients: { id: string; name: string }[];
  userId: string;
  canManage: boolean;
  error: boolean;
  previewAction: (
    id: string,
  ) => Promise<{ data: ClientPreview } | { error: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [preferences, setPreferences] = useBrowserPreference<{
    favorites: string[];
    density: string;
  }>(`cg-client-directory:${userId}`, {
    favorites: [],
    density: "comfortable",
  });
  const favorites = Array.isArray(preferences?.favorites)
    ? preferences.favorites.filter((value) => typeof value === "string")
    : [];
  const [view, setView] = useState(
    params.get("list") === "favorites" ? "favorites" : "all",
  );
  const density =
    preferences?.density === "compact" ? "compact" : "comfortable";
  const [sort, setSort] = useState(
    params.get("sort") === "desc" ? "desc" : "asc",
  );
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [lastParams, setLastParams] = useState(params.toString());
  if (lastParams !== params.toString()) {
    setLastParams(params.toString());
    setQuery(params.get("q") ?? "");
    setView(params.get("list") === "favorites" ? "favorites" : "all");
    setSort(params.get("sort") === "desc" ? "desc" : "asc");
    setPage(1);
  }
  function save(nextFavorites: string[], nextDensity = density) {
    setPreferences({ favorites: nextFavorites, density: nextDensity });
  }
  function updateUrl(q: string, list = view, direction = sort) {
    const search = new URLSearchParams({ view: "new" });
    if (q) search.set("q", q);
    if (list === "favorites") search.set("list", list);
    if (direction === "desc") search.set("sort", direction);
    // The data is already authorized and loaded. Native history preserves
    // search/back behavior without another request on every keystroke.
    window.history.replaceState(null, "", `/clients?${search}`);
  }
  const visible = clients
    .filter(
      (c) =>
        c.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
        (view !== "favorites" || favorites.includes(c.id)),
    )
    .sort((a, b) =>
      sort === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name),
    );
  const pages = Math.max(1, Math.ceil(visible.length / 40));
  const current = Math.min(page, pages);
  return (
    <div className={`${s.workspace} ${s.pageGutter}`}>
      <header className={s.header}>
        <div>
          <h1>
            Clients{" "}
            <span className={s.muted}>{error ? "" : clients.length}</span>
          </h1>
        </div>
        <div className={s.toolbar}>
          <ClientViewSwitch view="new" />
          {canManage && (
            <Link className={s.primary} href="/clients/new">
              + Add client
            </Link>
          )}
        </div>
      </header>
      <div className={s.sectionHeader}>
        <div className={s.toolbar}>
          <AnimatedTabs
            className={s.choiceStrip}
            label="Client list"
            value={view}
            items={[
              { value: "all", label: "All clients" },
              { value: "favorites", label: "Favorites" },
            ]}
            onChange={(value) => {
              setView(value);
              setPage(1);
              updateUrl(query, value);
            }}
          />
        </div>
        <div className={s.toolbar}>
          <input
            type="search"
            aria-label="Search clients"
            placeholder="Search clients…"
            className={`${s.input} ${s.search}`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
              updateUrl(e.target.value);
            }}
          />
          <button
            className={s.button}
            aria-pressed={density === "compact"}
            onClick={() =>
              save(favorites, density === "compact" ? "comfortable" : "compact")
            }
          >
            Compact
          </button>
        </div>
      </div>
      {error ? (
        <div className={s.error} role="alert">
          Clients couldn’t be loaded. Your data has not been changed.{" "}
          <button className={s.button} onClick={() => router.refresh()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className={s.tableWrap}>
            <table
              className={`${s.table} ${density === "compact" ? s.compact : ""}`}
            >
              <caption className={s.srOnly}>Client directory</caption>
              <thead>
                <tr>
                  <th aria-sort={sort === "asc" ? "ascending" : "descending"}>
                    <button
                      onClick={() => {
                        const next = sort === "asc" ? "desc" : "asc";
                        setSort(next);
                        updateUrl(query, view, next);
                      }}
                    >
                      Client name{" "}
                      <span aria-hidden="true">
                        {sort === "asc" ? "↑" : "↓"}
                      </span>
                    </button>
                  </th>
                  <th>
                    <span className={s.srOnly}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible
                  .slice((current - 1) * 40, current * 40)
                  .map((client) => (
                    <tr key={client.id}>
                      <td>
                        <div className={s.nameCell}>
                          <span className={s.monogram} aria-hidden="true">
                            {client.name
                              .split(/\s+/)
                              .map((p) => p[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <Link
                            prefetch={false}
                            href={clientHref(client.id)}
                            className={s.nameLink}
                          >
                            {client.name}
                          </Link>
                        </div>
                      </td>
                      <td>
                        <div className={s.directoryActions}>
                          <button
                            className={s.star}
                            aria-label={`${favorites.includes(client.id) ? "Unfavorite" : "Favorite"} ${client.name}`}
                            aria-pressed={favorites.includes(client.id)}
                            onClick={() =>
                              save(
                                favorites.includes(client.id)
                                  ? favorites.filter((id) => id !== client.id)
                                  : [...favorites, client.id],
                              )
                            }
                          >
                            {favorites.includes(client.id) ? "★" : "☆"}
                          </button>
                          <button
                            className={s.button}
                            aria-label={`Preview ${client.name}`}
                            onClick={() => setPreview(client)}
                          >
                            Preview
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!visible.length && (
              <div className={s.empty}>
                <h3>
                  {query
                    ? "No matching clients"
                    : view === "favorites"
                      ? "No favorites yet"
                      : "No clients yet"}
                </h3>
                <p>
                  {query
                    ? "Try another name or clear your search."
                    : view === "favorites"
                      ? "Use the star beside a client to keep it here."
                      : "Add a client from Autotask to get started."}
                </p>
              </div>
            )}
          </div>
          <div className={s.pagination}>
            <span>
              {visible.length
                ? `${(current - 1) * 40 + 1}–${Math.min(current * 40, visible.length)} of ${visible.length} clients`
                : "0 clients"}
            </span>
            <div className={s.toolbar}>
              <button
                className={s.button}
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                Previous
              </button>
              <span>
                Page {current} of {pages}
              </span>
              <button
                className={s.button}
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
      <AnimatedDialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        title={preview?.name ?? "Client preview"}
        variant="drawer"
        className={s.drawer}
      >
        {preview && (
          <Preview key={preview.id} id={preview.id} action={previewAction} />
        )}
      </AnimatedDialog>
    </div>
  );
}
function Preview({
  id,
  action,
}: {
  id: string;
  action: (id: string) => Promise<{ data: ClientPreview } | { error: string }>;
}) {
  const [result, setResult] = useState<ClientPreview | null>(null);
  const feedback = useActionFeedback();
  const [ready, setReady] = useState(false);
  async function load() {
    await feedback.run(async () => {
      const response = await action(id);
      if ("error" in response) return { ok: false, error: response.error };
      setResult(response.data);
      return { ok: true };
    });
  }
  useEffect(() => {
    let live = true;
    action(id)
      .then((response) => {
        if (live && "data" in response) setResult(response.data);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [id, action]);
  return (
    <div className={`${s.workspace} ${s.stack}`}>
      {!ready ? (
        <p role="status">Loading client details…</p>
      ) : !result ? (
        <div className={s.error} role="alert">
          Preview unavailable.{" "}
          <StatefulButton
            status={feedback.status}
            onClick={load}
            className={s.button}
          >
            Retry
          </StatefulButton>
        </div>
      ) : (
        <dl className={s.detailList}>
          {[
            ["Primary contact", result.primary_contact_name],
            ["Email", result.primary_contact_email],
            ["Phone", result.primary_contact_phone],
            ["Address", result.address],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "Not provided"}</dd>
            </div>
          ))}
        </dl>
      )}
      <Link className={s.primary} href={clientHref(id)}>
        Open client →
      </Link>
    </div>
  );
}
