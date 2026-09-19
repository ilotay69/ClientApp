"use client";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { ClientDetailsForm } from "@/components/client-details-form";
import { AnimatedDialog } from "@/components/ui/animated-dialog";
import { CGSelect } from "@/components/ui/cg-select";
import { CGConfirmDiscard } from "@/components/ui/confirm-discard";
import {
  StatefulButton,
  useActionFeedback,
} from "@/components/ui/stateful-button";
import s from "@/components/ui/client-surfaces.module.css";

export function ClientDetailsEditor(
  props: ComponentProps<typeof ClientDetailsForm>,
) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [owner, setOwner] = useState(props.ownerId ?? "");
  const [discard, setDiscard] = useState(false);
  const feedback = useActionFeedback();
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = feedback.status === "pending";
  useEffect(() => {
    if (!open || !dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [open, dirty]);
  function close(next: boolean) {
    if (!next && pending) return;
    if (!next && dirty) {
      setDiscard(true);
      return;
    }
    setOpen(next);
    setDirty(false);
  }
  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <h3>Client details</h3>
        {props.canEdit && (
          <button
            className={s.button}
            ref={trigger}
            onClick={() => {
              setOwner(props.ownerId ?? "");
              setOpen(true);
            }}
          >
            Edit details
          </button>
        )}
      </div>
      <dl className={`${s.detailList} ${s.formGrid}`}>
        {[
          ["Primary contact", props.primaryContactName],
          ["Email", props.primaryContactEmail],
          ["Phone", props.primaryContactPhone],
          ["Account owner", props.ownerName],
          ["Address", props.address],
          ["Reference notes", props.notes],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Not provided"}</dd>
          </div>
        ))}
      </dl>
      <p className={s.muted} style={{ marginTop: 22 }}>
        Primary contact and address may be refreshed from Autotask. Account
        ownership and reference notes are maintained here.
      </p>
      <AnimatedDialog
        open={open}
        onOpenChange={close}
        title="Edit client details"
        variant="drawer"
        className={s.drawer}
        finalFocus={trigger}
      >
        <form
          className={`${s.workspace} ${s.form}`}
          onChange={() => setDirty(true)}
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            data.set("owner_id", owner);
            const ok = await feedback.run(async () => {
              const result = await props.saveAction(
                props.clientId,
                { error: null, success: null },
                data,
              );
              return result.error === null && Boolean(result.success)
                ? { ok: true }
                : {
                    ok: false,
                    error: result.error ?? "The client could not be saved.",
                  };
            });
            if (ok) {
              setDirty(false);
              setOpen(false);
              router.refresh();
            }
          }}
        >
          <div className={s.formGrid}>
            {[
              {
                label: "Primary contact",
                name: "primary_contact_name",
                value: props.primaryContactName,
                type: "text",
              },
              {
                label: "Email",
                name: "primary_contact_email",
                value: props.primaryContactEmail,
                type: "email",
              },
              {
                label: "Phone",
                name: "primary_contact_phone",
                value: props.primaryContactPhone,
                type: "tel",
              },
            ].map((field) => (
              <label className={s.field} key={field.name}>
                {field.label}
                <input
                  className={s.input}
                  type={field.type}
                  name={field.name}
                  defaultValue={field.value ?? ""}
                  disabled={pending}
                />
              </label>
            ))}
            <div className={s.field}>
              <span>Account owner</span>
              <CGSelect
                searchable
                label="Account owner"
                value={owner}
                disabled={pending}
                onChange={(value) => {
                  setOwner(value);
                  setDirty(true);
                }}
                options={[
                  { value: "", label: "Unassigned" },
                  ...props.members.map((member) => ({
                    value: member.id,
                    label: member.full_name,
                  })),
                ]}
              />
            </div>
          </div>
          <label className={s.field}>
            Address
            <textarea
              className={s.input}
              name="address"
              defaultValue={props.address ?? ""}
              disabled={pending}
            />
          </label>
          <label className={s.field}>
            Reference notes
            <textarea
              className={s.input}
              name="notes"
              defaultValue={props.notes ?? ""}
              disabled={pending}
            />
          </label>
          {feedback.error && (
            <p role="alert" className={s.error}>
              {feedback.error}
            </p>
          )}
          <div className={s.formFooter}>
            <button
              type="button"
              className={s.button}
              disabled={pending}
              onClick={() => close(false)}
            >
              Cancel
            </button>
            <StatefulButton
              className={s.primary}
              type="submit"
              status={feedback.status}
            >
              Save changes
            </StatefulButton>
          </div>
        </form>
        <CGConfirmDiscard
          open={discard}
          onKeep={() => setDiscard(false)}
          onDiscard={() => {
            setDiscard(false);
            setDirty(false);
            setOpen(false);
          }}
        />
      </AnimatedDialog>
    </section>
  );
}
