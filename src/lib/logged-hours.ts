import { createAdminClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export type LoggedHoursEntry = {
  id: string;
  userId: string;
  userName: string;
  /** yyyy-mm-dd, matching the plain `date` column - compared and displayed
   * as calendar dates throughout, never parsed as a timestamp. */
  workDate: string;
  hours: number;
};

export type MonthHalf = "first" | "second";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The standard semi-monthly payroll split - the 1st through the 15th, and
 * the 16th through however many days that month actually has (28-31).
 * Pure calendar-date math, no timezone conversion involved anywhere. */
export function monthHalfBounds(year: number, month: number, half: MonthHalf) {
  if (half === "first") {
    return { start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-15` };
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${pad2(month)}-16`, end: `${year}-${pad2(month)}-${pad2(lastDay)}` };
}

export function dayOfMonth(workDate: string): number {
  return Number(workDate.slice(8, 10));
}

/** One month's worth of logged hours - every staff member's when userId is
 * omitted (the owner-only "team hours" view), or just one person's own
 * entries otherwise. Joined to profiles for the display name since owners
 * need to tell whose entry is whose; a solo view never renders it. */
export async function fetchLoggedHoursForMonth(
  year: number,
  month: number,
  opts: { userId?: string } = {},
  admin: AdminClient = createAdminClient()
): Promise<LoggedHoursEntry[]> {
  const monthStart = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  let query = admin
    .from("logged_hours")
    .select("id, user_id, work_date, hours, profiles:user_id(full_name)")
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd)
    .order("work_date", { ascending: true });

  if (opts.userId) query = query.eq("user_id", opts.userId);

  const { data } = await query;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      userName: (profile as { full_name?: string } | null)?.full_name ?? "Unknown",
      workDate: row.work_date as string,
      hours: Number(row.hours),
    };
  });
}
