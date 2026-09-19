"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TodoPreferences, Result } from "@/lib/my-todo-workspace";
import s from "./workspace.module.css";
import { AnimatedTabs } from "../ui/animated-tabs";
export function TodoViewSwitch({
  view,
  preferences,
  save,
}: {
  view: "old" | "new";
  preferences: TodoPreferences;
  save: (prefs: TodoPreferences) => Promise<Result<TodoPreferences>>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function change(next: "old" | "new") {
    if (next === view) return;
    start(async () => {
      setError(null);
      try {
        const result = await save({ ...preferences, view: next });
        if (result.error) {
          setError(result.error);
          return;
        }
        const query = new URLSearchParams(params.toString());
        query.set("view", next);
        if (next === "old") {
          const tab = query.get("tab");
          if (tab === "inbox") query.set("tab", "mailbox");
          else if (tab === "time") query.set("tab", "hours");
          else if (tab === "today") query.set("tab", "tasks");
        }
        query.delete("item");
        router.push(`/my-todo?${query}`, { scroll: false });
      } catch {
        setError("Couldn't switch views. Please try again.");
      }
    });
  }
  return (
    <div>
      <AnimatedTabs
        className={s.viewSwitch}
        label="My To-Do appearance"
        value={view}
        onChange={change}
        disabled={pending}
        items={[
          { value: "old", label: "Old view" },
          { value: "new", label: "New view" },
        ]}
      />
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}
