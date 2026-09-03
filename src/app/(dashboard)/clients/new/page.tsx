import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ClientForm } from "@/components/client-form";
import { AutotaskClientSearch } from "@/components/autotask-client-search";
import {
  createClientRecord,
  createClientFromAutotaskCompany,
  searchAutotaskCompaniesAction,
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
        searchAction={searchAutotaskCompaniesAction}
        createAction={createClientFromAutotaskCompany}
      />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">or enter details manually</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <ClientForm action={createClientRecord} submitLabel="Create client" />
    </div>
  );
}
