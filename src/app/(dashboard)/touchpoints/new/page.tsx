import { createClient } from "@/lib/supabase/server";
import { TouchpointForm } from "@/components/touchpoint-form";
import { createTouchpoint } from "../actions";

export default async function NewTouchpointPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const { client_id } = await searchParams;
  const supabase = await createClient();
  const [{ data: clients }, { data: members }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">New touchpoint</h1>
      <TouchpointForm
        clients={clients ?? []}
        members={members ?? []}
        defaultClientId={client_id}
        action={createTouchpoint}
        submitLabel="Schedule touchpoint"
      />
    </div>
  );
}
