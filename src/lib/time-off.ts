import { createAdminClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export type TimeOffType = "vacation" | "sick";
export type TimeOffStatus = "pending" | "approved" | "declined";

export type TimeOffNote = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export type TimeOffRequest = {
  id: string;
  userId: string;
  userName: string;
  type: TimeOffType;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: TimeOffStatus;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  notes: TimeOffNote[];
};

/** Every staff member's requests when userId is omitted (the owner-only
 * "team" view), or just one person's own otherwise. Notes are fetched in
 * one batched second query rather than per-request, same posture as
 * fetchLoggedHoursForMonth's own joins - the request list here is always
 * small enough that eager-loading every note up front (rather than a
 * click-to-expand fetch, like task notes) keeps this simple. */
export async function fetchTimeOffRequests(
  opts: { userId?: string } = {},
  admin: AdminClient = createAdminClient()
): Promise<TimeOffRequest[]> {
  let query = admin
    .from("time_off_requests")
    .select(
      `id, user_id, type, start_date, end_date, reason, status, decided_at, created_at,
       profiles:user_id(full_name), decided_by_profile:decided_by(full_name)`
    )
    .order("start_date", { ascending: false });

  if (opts.userId) query = query.eq("user_id", opts.userId);

  const { data } = await query;
  const requests = data ?? [];
  const ids = requests.map((r: { id: string }) => r.id);

  const { data: noteRows } = ids.length
    ? await admin
        .from("time_off_request_notes")
        .select("id, request_id, author_id, body, created_at, profiles:author_id(full_name)")
        .in("request_id", ids)
        .order("created_at", { ascending: true })
    : { data: [] };

  const notesByRequest = new Map<string, TimeOffNote[]>();
  for (const row of noteRows ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const list = notesByRequest.get(row.request_id) ?? [];
    list.push({
      id: row.id,
      authorId: row.author_id ?? null,
      authorName: (profile as { full_name?: string } | null)?.full_name ?? null,
      body: row.body,
      createdAt: row.created_at,
    });
    notesByRequest.set(row.request_id, list);
  }

  return requests.map((r: Record<string, unknown>) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const decidedByProfile = Array.isArray(r.decided_by_profile) ? r.decided_by_profile[0] : r.decided_by_profile;
    return {
      id: r.id as string,
      userId: r.user_id as string,
      userName: (profile as { full_name?: string } | null)?.full_name ?? "Unknown",
      type: r.type as TimeOffType,
      startDate: r.start_date as string,
      endDate: r.end_date as string,
      reason: (r.reason as string) ?? null,
      status: r.status as TimeOffStatus,
      decidedByName: (decidedByProfile as { full_name?: string } | null)?.full_name ?? null,
      decidedAt: (r.decided_at as string) ?? null,
      createdAt: r.created_at as string,
      notes: notesByRequest.get(r.id as string) ?? [],
    };
  });
}
