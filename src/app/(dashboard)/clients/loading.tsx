import s from "@/components/ui/client-surfaces.module.css";
export default function ClientsLoading() {
  return (
    <div
      className={`${s.workspace} ${s.pageGutter} ${s.stack}`}
      role="status"
      aria-label="Loading client workspace"
    >
      <p className={s.muted}>Loading clients…</p>
      <div className={s.skeleton} />
      <div className={s.skeleton} />
      <div className={s.skeleton} />
    </div>
  );
}
