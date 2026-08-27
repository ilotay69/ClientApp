import { createClient } from "@/lib/supabase/server";
import { QuoteForm } from "@/components/quote-form";
import { createQuote } from "../actions";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const { client_id } = await searchParams;
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">New quote</h1>
      <QuoteForm
        clients={clients ?? []}
        defaultClientId={client_id}
        action={createQuote}
        submitLabel="Create quote"
      />
    </div>
  );
}
