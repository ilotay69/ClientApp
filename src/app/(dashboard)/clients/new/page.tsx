import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ClientForm } from "@/components/client-form";
import { createClientRecord } from "../actions";

export default async function NewClientPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_clients"))) {
    redirect("/clients");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">New client</h1>
      <ClientForm action={createClientRecord} submitLabel="Create client" />
    </div>
  );
}
