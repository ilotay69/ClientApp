import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { buildScreeningPrompt, BATCH_SIZE } from "@/lib/resume-screening";

export const dynamic = "force-dynamic";

/**
 * Read-only view of the EXACT prompt sent to the AI for resume screening —
 * built with the real buildScreeningPrompt function rather than a
 * separately-maintained description of the criteria, so this can never
 * drift out of sync with what screening actually does. The only thing that
 * varies per real screening call is the job posting text (filled in below
 * with whatever's currently active) and the applicant count (shown as
 * BATCH_SIZE, the most it's ever called with in one request).
 */
export default async function ScreeningPromptPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_recruitment"))) {
    redirect("/dashboard");
  }

  const { data: postings } = await supabase
    .from("job_postings")
    .select("title, description")
    .order("created_at", { ascending: false })
    .limit(1);
  const currentPosting = postings?.[0] ?? null;

  const prompt = currentPosting
    ? buildScreeningPrompt(currentPosting, BATCH_SIZE)
    : null;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/recruitment" className="text-sm font-medium text-brand underline">
          ← Back to Recruitment
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">AI screening prompt</h1>
        <p className="mt-1 text-sm text-slate-500">
          The exact text sent to the AI for every resume screening call, including the current
          job posting it's judged against. This is generated live from the same function
          screening itself uses — not a separate description that could fall out of date.
        </p>
      </div>

      {!currentPosting || !prompt ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            No active job posting yet — the prompt needs one to fill in, so there&apos;s nothing to
            show until a posting exists.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-medium text-slate-900">Against posting: {currentPosting.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Shown with {BATCH_SIZE} as the applicant count — the real number varies per batch (up
              to {BATCH_SIZE} resumes screened per AI call).
            </p>
          </div>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap px-4 py-4 text-xs leading-relaxed text-slate-700">
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
}
