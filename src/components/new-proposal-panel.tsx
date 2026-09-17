"use client";

import { useState, useTransition } from "react";
import { ClientCombobox, type ClientOption } from "@/components/client-combobox";
import type { CreateProposalState } from "@/app/(dashboard)/proposals/actions";

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
  clients: ClientOption[];
  action: (
    title: string,
    recipient: {
      clientId: string | null;
      company: string | null;
      contactName: string | null;
      email: string | null;
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

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await action(title, {
        clientId: kind === "client" ? clientId || null : null,
        company: kind === "prospect" ? company : null,
        contactName,
        email,
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
            onClick={() => setKind(option.value)}
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
          <ClientCombobox clients={clients} value={clientId} onChange={setClientId} />
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
