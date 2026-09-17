"use client";

import { useState, useTransition } from "react";
import { ClientCombobox, type ClientOption } from "@/components/client-combobox";
import type { CreateProposalState } from "@/app/(dashboard)/proposals/actions";

/** ClientCombobox itself only ever needs id+name to render/search - these
 * extra fields ride along on the same array purely so picking a client
 * here can prefill Contact name/email/Address from what's already synced
 * from Autotask, instead of retyping it every time. */
export type NewProposalClientOption = ClientOption & {
  contactName?: string | null;
  contactEmail?: string | null;
  address?: string | null;
};

/** Start a proposal for either an existing client or a company that isn't
 * one yet.
 *
 * Both halves exist because a prospect structurally can't be a clients row:
 * those only ever come from an active Autotask company, so the company
 * you're actually pitching to has nowhere to live until they sign. Typing
 * their name here is the whole point of the feature. */
export function NewProposalPanel({
  clients,
  action,
}: {
  clients: NewProposalClientOption[];
  action: (
    title: string,
    recipient: {
      clientId: string | null;
      company: string | null;
      contactName: string | null;
      email: string | null;
      address: string | null;
    }
  ) => Promise<CreateProposalState>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"client" | "prospect">("prospect");
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        New proposal
      </button>
    );
  }

  // Prefills from whatever's already synced from Autotask (see
  // syncClientAutotaskData) - unconditionally replaces the three fields
  // rather than only filling blanks, since they only ever mean "this
  // selected client's info" in the Existing-client half of the form; a
  // client with nothing on file clears them back to empty rather than
  // leaving a previous pick's values lingering under a new selection.
  const selectClient = (id: string) => {
    setClientId(id);
    const client = clients.find((c) => c.id === id);
    setContactName(client?.contactName ?? "");
    setEmail(client?.contactEmail ?? "");
    setAddress(client?.address ?? "");
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await action(title, {
        clientId: kind === "client" ? clientId || null : null,
        company: kind === "prospect" ? company : null,
        contactName,
        email,
        address,
      });
      // On success the action redirects and never returns, so anything
      // here is a real validation failure.
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="w-full max-w-xl space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">New proposal</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>

      <div className="flex gap-1">
        {(
          [
            { value: "prospect", label: "New prospect" },
            { value: "client", label: "Existing client" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setKind(option.value);
              // Switching modes clears the shared contact/address fields
              // rather than carrying over whatever an existing client's
              // pick prefilled - stale client info attached to what's
              // supposed to be a fresh prospect (or vice versa) would be
              // worse than an empty field.
              setClientId("");
              setCompany("");
              setContactName("");
              setEmail("");
              setAddress("");
            }}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
              kind === option.value
                ? "bg-brand text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Field label="Proposal title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Managed IT Services — 2026"
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
      </Field>

      {kind === "client" ? (
        <Field label="Client">
          <ClientCombobox clients={clients} value={clientId} onChange={selectClient} />
        </Field>
      ) : (
        <Field label="Company">
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Manufacturing Ltd."
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact name">
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </Field>
      </div>

      <Field label="Address">
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          placeholder={"123 Example St, Suite 100\nCity, Province  Postal Code"}
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
      </Field>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create draft"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
