import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { AutotaskClientSearch } from "@/components/autotask-client-search";
import {
  listUnaddedActiveAutotaskCompaniesAction,
  createClientsFromAutotaskCompanies,
} from "../actions";

export default async function NewClientPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_clients"))) {
    redirect("/clients");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">New client</h1>

      <AutotaskClientSearch
        listAction={listUnaddedActiveAutotaskCompaniesAction}
        createManyAction={createClientsFromAutotaskCompanies}
      />
    </div>
  );
}
