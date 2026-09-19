"use client";
import s from "@/components/ui/client-surfaces.module.css";
export default function ClientsError({ reset }: { reset: () => void }) {
  return (
    <div className={`${s.workspace} ${s.card}`} role="alert">
      <h2>Client information couldn’t be loaded</h2>
      <p className={s.muted}>Please try again. No records have been changed.</p>
      <button className={s.button} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
