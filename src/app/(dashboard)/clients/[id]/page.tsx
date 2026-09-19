import { cookies } from "next/headers";
import {
  CLIENT_VIEW_COOKIE,
  resolveClientView,
  resolveClientSection,
} from "@/lib/client-workspace";
import { ClientViewSwitch } from "@/components/clients/view-switch";
import ClientDetailContent from "./legacy-client-page";

export const dynamic = "force-dynamic";
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    view?: string;
    section?: string;
    sub?: string;
    deleteError?: string;
    compose?: string;
  }>;
}) {
  const query = await searchParams;
  const view = resolveClientView(
    query.view,
    (await cookies()).get(CLIENT_VIEW_COOKIE)?.value,
  );
  return (
    <ClientDetailContent
      params={params}
      searchParams={Promise.resolve(query)}
      workspace={view === "new"}
      section={resolveClientSection(query.section)}
      sub={query.sub}
      compose={query.compose}
      viewControl={view === "old" ? <ClientViewSwitch view="old" /> : undefined}
    />
  );
}
