import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuoteForm } from "@/components/quote-form";
import { DeleteButton } from "@/components/delete-button";
import { formatDate } from "@/lib/format";
import { updateQuote, deleteQuote, markQuoteFollowedUp } from "../actions";

export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: quote }, { data: clients }] = await Promise.all([
    supabase.from("quotes").select("*, clients(name)").eq("id", id).single(),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  if (!quote) notFound();

  const clientName = (quote.clients as unknown as { name: string } | null)?.name;
  const updateAction = updateQuote.bind(null, id, quote.client_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/quotes" className="text-sm text-slate-500 hover:underline">
            ← All quotes
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {quote.title}
          </h1>
          <p className="text-sm text-slate-500">
            {clientName ? (
              <Link href={`/clients/${quote.client_id}`} className="hover:underline">
                {clientName}
              </Link>
            ) : (
              "Unknown client"
            )}
            {quote.last_followed_up_at && (
              <> · last followed up {formatDate(quote.last_followed_up_at)}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={markQuoteFollowedUp.bind(null, id, quote.client_id)}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Mark followed up today
            </button>
          </form>
          <DeleteButton
            action={deleteQuote.bind(null, id, quote.client_id)}
            confirmText={`Delete the quote "${quote.title}"?`}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <QuoteForm
          quote={quote}
          clients={clients ?? []}
          action={updateAction}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}
