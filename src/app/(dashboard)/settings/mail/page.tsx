import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { SyncMailButton } from "@/components/sync-mail-button";
import { DeleteButton } from "@/components/delete-button";
import { disconnectMailbox } from "./actions";

export const dynamic = "force-dynamic";

export default async function MailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: connection } = await supabase
    .from("mail_connections")
    .select("mailbox_email, connected_at, last_synced_at")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Mailbox sync</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect your Microsoft 365 mailbox to automatically pull in emails
          whose subject starts with &quot;quote&quot; or &quot;project&quot;
          and link them to the matching client, based on the sender or
          recipient&apos;s email address.
        </p>
      </div>

      {connected && (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Mailbox connected successfully.
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {decodeURIComponent(error)}
        </div>
      )}

      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {connection ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">Connected mailbox</p>
              <p className="font-medium text-slate-900">{connection.mailbox_email}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Last synced</p>
              <p className="text-slate-900">
                {connection.last_synced_at
                  ? formatDate(connection.last_synced_at)
                  : "Never yet — click Sync now"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <SyncMailButton />
              <DeleteButton
                action={disconnectMailbox}
                confirmText="Disconnect this mailbox? You can reconnect any time."
                label="Disconnect"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">No mailbox connected yet.</p>
            <a
              href="/api/mail/connect"
              className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Connect Microsoft 365 mailbox
            </a>
          </div>
        )}
      </div>

      <p className="max-w-lg text-sm text-slate-500">
        Once connected, set up a Railway Cron Job to hit{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5">/api/mail-sync</code>{" "}
        every 30–60 minutes so this stays current automatically — see the
        README for the exact command. &quot;Sync now&quot; above triggers the
        same thing on demand.
      </p>
    </div>
  );
}
