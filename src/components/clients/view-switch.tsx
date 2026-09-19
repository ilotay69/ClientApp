"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import { CLIENT_VIEW_COOKIE, type ClientView } from "@/lib/client-workspace";
import s from "@/components/ui/client-surfaces.module.css";

export function ClientViewSwitch({ view }: { view: ClientView }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <AnimatedTabs
      className={s.choiceStrip}
      label="Clients appearance"
      value={view}
      disabled={pending}
      items={[
        { value: "old", label: "Old view" },
        { value: "new", label: "New view" },
      ]}
      onChange={(next) => {
        document.cookie = `${CLIENT_VIEW_COOKIE}=${next}; Path=/clients; Max-Age=31536000; SameSite=Lax`;
        const query = new URLSearchParams(params.toString());
        query.set("view", next);
        startTransition(() =>
          router.replace(`${pathname}?${query}`, { scroll: false }),
        );
      }}
    />
  );
}
