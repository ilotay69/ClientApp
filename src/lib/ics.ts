// Timezone conversion for scheduling interviews — interview invites
// themselves are now real Microsoft Graph calendar events (see
// createSharedMailboxEvent in microsoft-graph.ts), not a standalone .ics
// file, but staff still enter date/time in their own local (Toronto) time
// and that still needs converting to an unambiguous UTC instant either way.

const BUSINESS_TIME_ZONE = "America/Toronto";

/** Converts a wall-clock date+time, entered by staff in CG Technologies'
 * own local time (the GTA), to the equivalent UTC instant — needed because
 * this app's server may run in a different time zone (e.g. UTC on
 * Railway), and Graph's own event start/end need an unambiguous instant.
 * Compares two renderings of the same guessed instant (once in the target
 * zone, once in UTC) to derive the zone's current offset — correctly
 * handles EST/EDT without a timezone library, since Node's Intl API already
 * knows the rules. */
function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  const asZoned = new Date(guess.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = asUtc.getTime() - asZoned.getTime();
  return new Date(guess.getTime() + offsetMs);
}

/** Staff enters date/time in their own (Toronto) local time. */
export function interviewDateTimeToUtc(dateStr: string, timeStr: string): Date {
  return zonedTimeToUtc(dateStr, timeStr, BUSINESS_TIME_ZONE);
}
