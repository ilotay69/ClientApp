import { IconGlobe } from "@/components/icons";

const WATCHTOWER_URL = "https://watchtower.cgtechnologies.com/";

/** Just a link out to CG Watcher — that tool lives entirely on its own
 * site, so this tab is a launch point, not an embed. */
export function CgWatcherPanel() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <IconGlobe className="mx-auto h-8 w-8 text-slate-400" />
      <h2 className="mt-3 text-sm font-semibold text-slate-900">CG Watcher</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        Opens CG Watcher in a new tab.
      </p>
      <a
        href={WATCHTOWER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Open CG Watcher
      </a>
    </div>
  );
}
