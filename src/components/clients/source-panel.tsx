"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatedDialog } from "@/components/ui/animated-dialog";
import {
  StatefulButton,
  useActionFeedback,
} from "@/components/ui/stateful-button";
import { StatusMark } from "@/components/ui/status-mark";
import { formatClientSourceTime } from "@/lib/client-workspace";
import s from "@/components/ui/client-surfaces.module.css";
export type ClientSource = {
  name: string;
  connected: boolean;
  lastAttempt?: string | null;
  action?: () => Promise<{ error: string | null }>;
  note?: string;
};
export function ClientSourcePanel({
  sources,
  inline = false,
  mappingHref,
}: {
  sources: ClientSource[];
  inline?: boolean;
  mappingHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const content = (
    <div className={`${s.workspace} ${s.stack}`}>
      <p className={s.muted}>
        Connection mappings and cached data are separate. A connected source is
        not a health check.
      </p>
      {sources.map((source) => (
        <Source key={source.name} source={source} />
      ))}
      {mappingHref && (
        <a className={s.button} href={mappingHref}>
          Manage client mappings →
        </a>
      )}
    </div>
  );
  if (inline) return content;
  return (
    <>
      <button className={s.button} onClick={() => setOpen(true)}>
        Refresh & connections
      </button>
      <AnimatedDialog
        open={open}
        onOpenChange={setOpen}
        title="Client connections"
        description="Refresh an individual source and inspect its latest available sync information."
        variant="drawer"
        className={s.drawer}
      >
        {content}
      </AnimatedDialog>
    </>
  );
}
function Source({ source }: { source: ClientSource }) {
  const feedback = useActionFeedback();
  const router = useRouter();
  const [confirmed, setConfirmed] = useState<string | null>(null);
  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <h3>{source.name}</h3>
        <span className={s.pill}>
          {source.connected ? "Mapped" : "Not connected"}
        </span>
      </div>
      <p className={s.muted}>
        {confirmed
          ? `Refresh completed ${formatClientSourceTime(confirmed)}`
          : source.lastAttempt
            ? `Last automatic attempt: ${formatClientSourceTime(source.lastAttempt)}`
            : "No confirmed refresh time available."}
      </p>
      {source.note && <p className={s.muted}>{source.note}</p>}
      {source.action && source.connected && (
        <div className={s.toolbar} style={{ marginTop: 14 }}>
          <StatefulButton
            className={s.button}
            status={feedback.status}
            pendingLabel="Refreshing…"
            successLabel="Updated"
            onClick={() =>
              feedback.run(async () => {
                const response = await source.action!();
                if (response.error !== null)
                  return {
                    ok: false,
                    error: response.error || "Refresh did not complete.",
                  };
                setConfirmed(new Date().toISOString());
                router.refresh();
                return { ok: true };
              })
            }
          >
            Refresh {source.name}
          </StatefulButton>
          <StatusMark
            state={
              feedback.status === "pending"
                ? "running"
                : feedback.status === "error"
                  ? "error"
                  : "idle"
            }
          />
        </div>
      )}
      {feedback.error && (
        <p role="alert" className={s.error}>
          {feedback.error}
        </p>
      )}
    </section>
  );
}
