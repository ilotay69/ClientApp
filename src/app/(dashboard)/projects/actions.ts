"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { syncAllAutotaskClients } from "@/lib/autotask-sync";
import type { ProjectStatus } from "@/lib/types";

export type FormState = { error: string | null };

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function parseProjectFields(formData: FormData) {
  return {
    client_id: String(formData.get("client_id") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    status: String(formData.get("status") ?? "planning") as ProjectStatus,
    start_date: emptyToNull(formData.get("start_date")),
    target_end_date: emptyToNull(formData.get("target_end_date")),
    notes: emptyToNull(formData.get("notes")),
  };
}

export async function createProject(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_projects"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fields = parseProjectFields(formData);
  if (!fields.client_id) return { error: "Select a client." };
  if (!fields.name) return { error: "Project name is required." };

  const { data, error } = await supabase
    .from("projects")
    .insert({ ...fields, owner_id: user?.id ?? null })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/projects");
  revalidatePath(`/clients/${fields.client_id}`);
  redirect(`/projects/${data.id}`);
}

export async function updateProject(
  projectId: string,
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_projects"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const fields = parseProjectFields(formData);
  if (!fields.name) return { error: "Project name is required." };

  const { error } = await supabase
    .from("projects")
    .update(fields)
    .eq("id", projectId)
    // Autotask-sourced projects are edited in Autotask, not here — the
    // page already hides this form for them, but this holds regardless of
    // how the request got made.
    .is("source_autotask_ticket_id", null);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

/** Runs the same tickets/contract-services/Project-SLA sync the nightly
 * cron job does, on demand, for every Autotask-mapped client at once —
 * so a freshly Project-SLA-tagged ticket shows up here without visiting
 * each client's page individually. */
export async function syncAllAutotaskProjectsAction(): Promise<{ error: string | null }> {
  if (!(await requirePermission("manage_projects"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const result = await syncAllAutotaskClients(admin);
  if ("error" in result) return { error: result.error };

  await admin
    .from("autotask_settings")
    .update({ projects_last_synced_at: new Date().toISOString() })
    .eq("id", true);

  const failed = result.results.filter((r): r is { clientId: string; error: string } => "error" in r);

  revalidatePath("/projects");
  return {
    error:
      failed.length > 0
        ? `Synced ${result.synced - failed.length} of ${result.synced} clients — ${failed.length} failed.`
        : null,
  };
}

const AUTO_SYNC_THROTTLE_MS = 30 * 60 * 1000;

/** Fired (not awaited) from the Projects page itself on every visit, so
 * the list reflects recent Autotask changes without a manual "Sync
 * Autotask" click — but only if the last sync was more than 30 minutes
 * ago, and always in the background: a full sync loops every mapped
 * client sequentially and can take a while for a real book of business
 * (the same kind of long request that caused the "page couldn't load"
 * issue with a 77-company batch elsewhere), so this must never block the
 * page's own render. The timestamp is claimed up front, before the slow
 * part runs, so several people opening the page in the same window don't
 * each kick off their own sync. */
export async function autoSyncAutotaskProjectsIfStale(): Promise<void> {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("autotask_settings")
    .select("projects_last_synced_at")
    .eq("id", true)
    .maybeSingle();

  const lastSyncedAt = settings?.projects_last_synced_at
    ? new Date(settings.projects_last_synced_at).getTime()
    : 0;
  if (Date.now() - lastSyncedAt < AUTO_SYNC_THROTTLE_MS) return;

  await admin
    .from("autotask_settings")
    .update({ projects_last_synced_at: new Date().toISOString() })
    .eq("id", true);

  // No revalidatePath here: the page is already `force-dynamic`, so the
  // next visit re-queries Supabase regardless — and this call happens
  // detached from any request/render lifecycle, which revalidatePath
  // isn't meant to be called outside of.
  await syncAllAutotaskClients(admin);
}

export type ProjectTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  assigneeName: string | null;
};

/** Live-fetched only when a project's row is expanded — same on-demand
 * pattern used for Sales Requests'/Tasks' notes threads. */
export async function getProjectTasksAction(
  projectId: string
): Promise<{ tasks: ProjectTask[] } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, due_date, profiles:assigned_to(full_name)")
    .eq("project_id", projectId)
    .not("status", "in", "(done,dismissed)")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) return { error: error.message };

  return {
    tasks: (data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.due_date,
      assigneeName: (t.profiles as unknown as { full_name: string } | null)?.full_name ?? null,
    })),
  };
}

export async function deleteProject(projectId: string, clientId: string) {
  if (!(await requirePermission("manage_projects"))) return;

  const supabase = await createClient();
  await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .is("source_autotask_ticket_id", null);
  revalidatePath("/projects");
  revalidatePath(`/clients/${clientId}`);
  redirect("/projects");
}
