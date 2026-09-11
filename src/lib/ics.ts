// Builds a standard .ics calendar invite for a scheduled interview — no
// Microsoft Graph calendar write permission needed (unlike creating a real
// Outlook event), since this is just a file attached to a plain email; any
// calendar app the candidate uses can open it.

const BUSINESS_TIME_ZONE = "America/Toronto";

/** Converts a wall-clock date+time, entered by staff in CG Technologies'
 * own local time (the GTA), to the equivalent UTC instant — needed because
 * this app's server may run in a different time zone (e.g. UTC on
 * Railway), and an .ics file's DTSTART/DTEND need to be unambiguous.
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

function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Folds/escapes free text per RFC 5545 — commas, semicolons, and
 * newlines are structurally significant in an .ics file. */
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function buildInterviewIcs({
  uid,
  organizerEmail,
  organizerName,
  attendeeEmail,
  attendeeName,
  summary,
  description,
  location,
  start,
  durationMinutes,
}: {
  uid: string;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
  attendeeName: string;
  summary: string;
  description: string;
  location: string | null;
  start: Date;
  durationMinutes: number;
}): string {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const now = toIcsUtc(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CG Technologies//CG Ops Recruitment//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    `ORGANIZER;CN=${escapeIcsText(organizerName)}:mailto:${organizerEmail}`,
    `ATTENDEE;CN=${escapeIcsText(attendeeName)};RSVP=TRUE:mailto:${attendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);

  // .ics requires CRLF line endings.
  return lines.join("\r\n");
}
