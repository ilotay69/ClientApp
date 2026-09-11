// Minimal Microsoft Graph + Azure AD OAuth helpers. No SDK — Microsoft's v2.0
// endpoint is plain HTTPS, which keeps this dependency-free.

const AUTHORITY = () =>
  `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`;

const THROTTLE_MAX_RETRIES = 3;

/**
 * Fetches a Graph URL with retry-with-backoff on 429 ("ApplicationThrottled"
 * / MailboxConcurrency limit, a real error hit once mailbox review started
 * walking many subfolders) — honors the Retry-After header when Graph sends
 * one, otherwise backs off a couple seconds. Every Graph GET in this file
 * that can run inside a loop over many folders/pages goes through this,
 * since any of them can be the one that trips the limit.
 */
async function graphFetch(url: string, accessToken: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status !== 429 || attempt >= THROTTLE_MAX_RETRIES) return res;

    const retryAfterSeconds = Number(res.headers.get("Retry-After")) || 2;
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
  }
}

/** Scopes requested for the "connect my mailbox" flow (not the login flow).
 * Adding Calendars.Read here only affects NEW connections — an existing
 * mail_connections row was consented under the old, narrower scope list,
 * and Microsoft won't silently grant a scope that was never consented to
 * just because this constant changed. Anyone who connected before this
 * scope was added needs to reconnect (Settings → Mailbox → Connect again)
 * to actually get calendar access. */
export const MAIL_SCOPES = "openid offline_access User.Read Mail.Read Calendars.Read";

export function buildAuthorizeUrl(redirectUri: string, state: string) {
  const url = new URL(`${AUTHORITY()}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", process.env.AZURE_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MAIL_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  return requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

export async function refreshAccessToken(refreshToken: string) {
  return requestToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID!,
    client_secret: process.env.AZURE_CLIENT_SECRET!,
    scope: MAIL_SCOPES,
    ...params,
  });

  const res = await fetch(`${AUTHORITY()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token request failed (${res.status}): ${text}`);
  }

  return res.json();
}

export type AppOnlyToken = { accessToken: string; expiresAt: string };

/**
 * App-only (client-credentials) Graph token for THIS app's own tenant/app
 * registration — deliberately not the delegated per-user OAuth flow the rest
 * of this file is built around. Delegated refresh_token grants are what left
 * /api/mail-sync's cron permanently paused (AADSTS53003 — a tenant
 * Conditional Access policy blocks silent token refresh with no interactive
 * user present); a client-credentials grant has no per-user session or
 * refresh token to blow up in the first place, the same reasoning
 * m365-partner.ts's fetchAppOnlyToken already relies on for M365 partner
 * sync. Requires Application permissions (not just the delegated ones
 * MAIL_SCOPES requests) granted with admin consent on the app registration,
 * restricted via an Exchange Application Access Policy to only the intended
 * mailbox — see the shared-mailbox integration's own setup notes.
 */
export async function fetchAppOnlyGraphToken(): Promise<AppOnlyToken> {
  const res = await fetch(`${AUTHORITY()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AZURE_CLIENT_ID!,
      client_secret: process.env.AZURE_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft app-only token request failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Microsoft app-only token response did not include an access_token.");

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  };
}

export type GraphMessage = {
  id: string;
  subject: string;
  receivedDateTime: string;
  webLink: string;
  bodyPreview?: string;
  categories?: string[];
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  flag?: { flagStatus?: "notFlagged" | "complete" | "flagged" };
};

/**
 * Fetches messages received after `sinceIso`, newest constraint aside —
 * ordered oldest-first so the caller can safely bump its "last synced"
 * checkpoint as it processes them. Follows pagination up to `maxPages`.
 */
export async function fetchRecentMessages(
  accessToken: string,
  sinceIso: string,
  maxPages = 5
): Promise<GraphMessage[]> {
  const base = new URL("https://graph.microsoft.com/v1.0/me/messages");
  base.searchParams.set(
    "$select",
    "id,subject,from,toRecipients,receivedDateTime,webLink,bodyPreview,categories,flag"
  );
  base.searchParams.set("$filter", `receivedDateTime ge ${sinceIso}`);
  base.searchParams.set("$orderby", "receivedDateTime asc");
  base.searchParams.set("$top", "50");

  let url: string | null = base.toString();
  const messages: GraphMessage[] = [];
  let pages = 0;

  while (url && pages < maxPages) {
    const res: Response = await graphFetch(url, accessToken);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph request failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    messages.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? null;
    pages += 1;
  }

  return messages;
}

/**
 * Every message currently flagged for follow-up (Outlook's `flag/flagStatus
 * eq 'flagged'`), mailbox-wide, received on or after `sinceIso` — a flag can
 * be added well after a message first arrives, so this isn't tied to the
 * incremental "since last sync" checkpoint, but it's still capped to a
 * recent window rather than scanning the whole mailbox's history.
 */
export async function fetchFlaggedMessages(
  accessToken: string,
  sinceIso: string,
  maxPages = 10
): Promise<GraphMessage[]> {
  const base = new URL("https://graph.microsoft.com/v1.0/me/messages");
  base.searchParams.set(
    "$select",
    "id,subject,from,toRecipients,receivedDateTime,webLink,bodyPreview,categories,flag"
  );
  base.searchParams.set("$filter", `flag/flagStatus eq 'flagged' and receivedDateTime ge ${sinceIso}`);
  base.searchParams.set("$top", "50");

  let url: string | null = base.toString();
  const messages: GraphMessage[] = [];
  let pages = 0;

  while (url && pages < maxPages) {
    const res: Response = await graphFetch(url, accessToken);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph flagged-messages request failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    messages.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? null;
    pages += 1;
  }

  return messages;
}

export type MailboxSnapshotMessage = GraphMessage & {
  conversationId: string;
  parentFolderId: string;
  sentDateTime?: string;
};

/**
 * Fetches every message mailbox-wide (every folder at once, not one
 * folder at a time) — used by the mailbox review. A per-folder scan
 * misses a thread's true latest message once the user files it away into
 * whatever folder they use for "already handled" mail; /me/messages
 * covers the entire mailbox in one paginated call, so nothing gets missed
 * just because it moved. Pulls conversationId/parentFolderId too, so the
 * caller can group into threads and exclude system folders (see
 * getExcludedSystemFolderIds) by id.
 */
export async function fetchMailboxWideMessages(
  accessToken: string,
  sinceIso: string,
  maxPages = 10
): Promise<{ messages: MailboxSnapshotMessage[]; hitPageCap: boolean }> {
  const base = new URL("https://graph.microsoft.com/v1.0/me/messages");
  base.searchParams.set(
    "$select",
    "id,subject,from,toRecipients,receivedDateTime,sentDateTime,webLink,bodyPreview,conversationId,parentFolderId"
  );
  base.searchParams.set("$filter", `receivedDateTime ge ${sinceIso}`);
  base.searchParams.set("$orderby", "receivedDateTime asc");
  base.searchParams.set("$top", "50");

  let url: string | null = base.toString();
  const messages: MailboxSnapshotMessage[] = [];
  let pages = 0;

  while (url && pages < maxPages) {
    const res: Response = await graphFetch(url, accessToken);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph request failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    messages.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? null;
    pages += 1;
  }

  return { messages, hitPageCap: Boolean(url) };
}

// Folders that never represent "live" client conversation — resolved to
// real folder ids once per review (a mailbox-wide message carries only
// its parentFolderId, not a folder name), so messages in these are
// excluded regardless of how old or new they are. Conversation History is
// a hidden system folder some mailboxes don't have at all; a missing
// folder is silently skipped rather than treated as an error.
const SYSTEM_EXCLUDED_FOLDER_NAMES = ["deleteditems", "junkemail", "drafts", "conversationhistory", "outbox"];

export async function getExcludedSystemFolderIds(accessToken: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const name of SYSTEM_EXCLUDED_FOLDER_NAMES) {
    const res = await graphFetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${name}`, accessToken);
    if (!res.ok) continue;
    const json = await res.json();
    if (json.id) ids.add(json.id);
  }
  return ids;
}

type MailFolderSummary = { id: string; displayName: string };

async function listMailFolders(accessToken: string, url: string): Promise<MailFolderSummary[]> {
  const res = await graphFetch(url, accessToken);
  if (!res.ok) {
    throw new Error(`Failed to list mail folders (${res.status})`);
  }
  const json = await res.json();
  return json.value ?? [];
}

// Safety cap on a breadth-first folder-tree walk — protects against a
// pathological mailbox with an enormous or (in principle) cyclical folder
// structure. A real mailbox's folder count is nowhere near this.
const MAX_FOLDERS_SCANNED = 500;

/**
 * Finds a folder by its exact display name (case-insensitive), searching the
 * ENTIRE folder tree breadth-first — not just top-level folders and Inbox's
 * direct children. A first version of this only checked those two spots
 * (matching the common case of a custom folder sitting right under Inbox),
 * but a real mailbox can have a folder nested anywhere — under a different
 * top-level folder, or more than one level deep — and that version reported
 * "not found" for a folder that plainly existed. Top-level folders are still
 * checked first (the queue starts there), so the common case is exactly as
 * fast as before; this just doesn't give up if that's not where it is.
 *
 * Resurrected from commit 0f2ccc6's predecessor (removed when mailbox
 * review switched to mailbox-wide scanning) — used here for the Resume
 * Screener, which is intentionally scoped to one specific folder rather
 * than the whole mailbox.
 */
export async function findFolderIdByDisplayName(
  accessToken: string,
  displayName: string
): Promise<string | null> {
  const target = displayName.toLowerCase();

  let queue: string[] = ["https://graph.microsoft.com/v1.0/me/mailFolders?$top=100"];
  let scanned = 0;

  while (queue.length > 0 && scanned < MAX_FOLDERS_SCANNED) {
    const url = queue.shift()!;
    const folders = await listMailFolders(accessToken, url);
    for (const folder of folders) {
      scanned += 1;
      if (folder.displayName.toLowerCase() === target) return folder.id;
      queue.push(`https://graph.microsoft.com/v1.0/me/mailFolders/${folder.id}/childFolders?$top=100`);
    }
  }

  return null;
}

/**
 * Strips an HTML email body down to plain text — good enough for feeding an
 * AI prompt, not a faithful rendering. Deliberately no new dependency for
 * this (a proper HTML-to-text library is more than this needs, and every
 * new npm package added to this app carries the same untestable-until-deploy
 * risk mammoth already does); Claude reads slightly-imperfect text fine
 * since this is read for facts, not formatting.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ResumeCandidateMessage = {
  id: string;
  subject: string;
  receivedDateTime: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  /** Full body, not bodyPreview's short snippet — a job-board notification
   * email's own content (screening-question answers, etc.) is genuinely
   * useful input on its own, independent of whether it has a resume
   * attachment. Graph returns HTML by default; htmlToPlainText below
   * strips it down for the AI prompt. */
  body?: { contentType: "html" | "text"; content: string };
};

/**
 * Every message in one specific folder received on or after sinceIso — NOT
 * filtered to `hasAttachments eq true` (an earlier version of this function
 * was). Some applications arrive as a notification with no attachment at
 * all — a job board's "you have a new applicant" email linking out to their
 * own site, rather than a resume file this app can read directly. Every
 * message in the watched folder becomes a resumes row either way; the ones
 * with no supported attachment just start with no resume content beyond
 * whatever the notification's own body says, until staff add one via
 * upload or paste (see resume-sync.ts).
 */
export async function fetchResumeCandidateMessages(
  accessToken: string,
  folderId: string,
  sinceIso: string,
  maxPages = 5
): Promise<{ messages: ResumeCandidateMessage[]; hitPageCap: boolean }> {
  const base = new URL(`https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`);
  base.searchParams.set("$select", "id,subject,from,receivedDateTime,body");
  base.searchParams.set("$filter", `receivedDateTime ge ${sinceIso}`);
  base.searchParams.set("$orderby", "receivedDateTime asc");
  base.searchParams.set("$top", "50");

  let url: string | null = base.toString();
  const messages: ResumeCandidateMessage[] = [];
  let pages = 0;

  while (url && pages < maxPages) {
    const res: Response = await graphFetch(url, accessToken);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph request failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    messages.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? null;
    pages += 1;
  }

  return { messages, hitPageCap: Boolean(url) };
}

export type GraphFileAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes: string;
};

// PDF and modern (.docx) Word only — legacy .doc (the pre-2007 binary
// format) has no equivalent text-extraction path here (mammoth, used for
// screening, reads .docx's XML structure; it can't read the old binary
// format at all), so it's deliberately excluded rather than silently
// mishandled.
const PDF_MEDIA_TYPE = "application/pdf";
const DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Normalizes a raw attachment's content type to exactly one of the two
 * supported values, or null if it's neither — Outlook and other mail
 * clients frequently send a generic `application/octet-stream` even for a
 * real PDF or Word file (the same mislabeling this app already works around
 * for client document uploads), so the filename extension is checked
 * whenever the declared MIME type doesn't already match cleanly. Returning a
 * normalized value here (rather than passing Graph's raw, possibly-generic
 * contentType straight through) is what lets resumes.content_type reliably
 * drive screening's PDF-vs-Word branch later — it's never ambiguous by the
 * time it's stored.
 */
function normalizeResumeContentType(raw: { name?: string; contentType?: string }): string | null {
  const name = (raw.name ?? "").toLowerCase();
  if (raw.contentType === PDF_MEDIA_TYPE || name.endsWith(".pdf")) return PDF_MEDIA_TYPE;
  if (raw.contentType === DOCX_MEDIA_TYPE || name.endsWith(".docx")) return DOCX_MEDIA_TYPE;
  return null;
}

function isSupportedResumeAttachment(raw: {
  ["@odata.type"]?: string;
  name?: string;
  contentType?: string;
  contentBytes?: string;
}): boolean {
  if (raw["@odata.type"] !== "#microsoft.graph.fileAttachment") return false;
  if (!raw.contentBytes) return false;
  return normalizeResumeContentType(raw) !== null;
}

/**
 * A message's file attachments, filtered down to PDF and Word (.docx) only —
 * everything else (embedded signature images, other file types) is
 * discarded here so callers never have to filter again. Graph inlines small
 * attachments' bytes directly as base64 `contentBytes` in this same
 * response; resumes are always well under that inline-content threshold, so
 * there's no need for a second, per-attachment `/$value` call.
 *
 * No `$select` at all on this call — deliberately. Two things confirmed
 * against live Graph responses, not assumed: (1) this collection is typed
 * as the base `attachment` type, and `contentBytes` only exists on the
 * derived `fileAttachment` type, so naming it in `$select` gets a straight
 * 400 ("Could not find a property named 'contentBytes' on type
 * 'microsoft.graph.attachment'"). (2) `$select`'s presence changes the
 * default from "every property" to "only what's listed" — so trimming
 * `contentBytes` out of `$select` rather than dropping `$select` entirely
 * does NOT bring it back; it does the opposite; that half-fix shipped once
 * and produced "imported 0" for every attachment, since `contentBytes` was
 * then genuinely absent from the response. Omitting `$select` altogether is
 * what actually restores it, since Graph's un-selected default
 * representation for a `fileAttachment` includes it automatically.
 */
export async function fetchMessageAttachments(
  accessToken: string,
  messageId: string
): Promise<GraphFileAttachment[]> {
  const url = `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments`;
  const res = await graphFetch(url, accessToken);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft Graph attachments request failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  const raw: {
    ["@odata.type"]?: string;
    id: string;
    name: string;
    contentType: string;
    size: number;
    contentBytes?: string;
  }[] = json.value ?? [];

  return raw.filter(isSupportedResumeAttachment).map((a) => ({
    id: a.id,
    name: a.name,
    // Normalized, not Graph's raw value — see normalizeResumeContentType.
    // isSupportedResumeAttachment already confirmed this returns non-null.
    contentType: normalizeResumeContentType(a) as string,
    size: a.size,
    contentBytes: a.contentBytes as string,
  }));
}

export type GraphEvent = {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  webLink?: string;
};

/**
 * Every calendar occurrence between startIso and endIso — uses
 * calendarView, not /me/events: events would return a recurring series'
 * master definition once, not each actual occurrence that falls in the
 * window, which is what "what's on my calendar this week" actually needs.
 */
export async function fetchUpcomingEvents(
  accessToken: string,
  startIso: string,
  endIso: string,
  maxPages = 5
): Promise<GraphEvent[]> {
  const base = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  base.searchParams.set("startDateTime", startIso);
  base.searchParams.set("endDateTime", endIso);
  base.searchParams.set("$select", "id,subject,start,end,isAllDay,location,organizer,webLink");
  base.searchParams.set("$top", "50");

  let url: string | null = base.toString();
  const events: GraphEvent[] = [];
  let pages = 0;

  while (url && pages < maxPages) {
    const res: Response = await graphFetch(url, accessToken);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph calendar request failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    events.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? null;
    pages += 1;
  }

  return events.sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime));
}

export async function fetchMailboxEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch mailbox profile (${res.status})`);
  }
  const json = await res.json();
  return json.mail ?? json.userPrincipalName;
}

export type SharedMailboxAttachment = {
  filename: string;
  contentBase64: string;
  contentType: string;
};

/**
 * Sends mail AS the given mailbox via app-only Graph auth — `/users/{id}/
 * sendMail`, not `/me/sendMail`, since there's no delegated "me" under
 * client-credentials. Requires the Mail.Send Application permission,
 * restricted (via an Exchange Application Access Policy) to just this
 * mailbox — without that restriction, app-only Mail.Send can act as any
 * mailbox in the tenant, which is why that policy is a hard requirement of
 * this integration, not an optional hardening step. `saveToSentItems: true`
 * is what makes a sent message show up in the mailbox's own Sent folder in
 * Outlook, same as sending normally would.
 */
export async function sendMailAsSharedMailbox(
  accessToken: string,
  mailboxEmail: string,
  message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    attachments?: SharedMailboxAttachment[];
  }
): Promise<void> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "HTML", content: message.html },
          toRecipients: [{ emailAddress: { address: message.to } }],
          attachments: (message.attachments ?? []).map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.filename,
            contentType: a.contentType,
            contentBytes: a.contentBase64,
          })),
        },
        saveToSentItems: true,
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft Graph sendMail failed (${res.status}): ${text}`);
  }
}

export type SharedMailboxMessage = {
  id: string;
  subject: string;
  receivedDateTime: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType: "html" | "text"; content: string };
};

/**
 * Every message in the shared mailbox received on or after sinceIso —
 * `/users/{id}/messages`, mailbox-wide (not one folder), same reasoning as
 * fetchMailboxWideMessages: a candidate's reply could land anywhere a mail
 * rule files it, not necessarily Inbox.
 */
export async function fetchSharedMailboxMessagesSince(
  accessToken: string,
  mailboxEmail: string,
  sinceIso: string,
  maxPages = 10
): Promise<SharedMailboxMessage[]> {
  const base = new URL(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxEmail)}/messages`
  );
  base.searchParams.set("$select", "id,subject,from,receivedDateTime,body");
  base.searchParams.set("$filter", `receivedDateTime ge ${sinceIso}`);
  base.searchParams.set("$orderby", "receivedDateTime asc");
  base.searchParams.set("$top", "50");

  let url: string | null = base.toString();
  const messages: SharedMailboxMessage[] = [];
  let pages = 0;

  while (url && pages < maxPages) {
    const res: Response = await graphFetch(url, accessToken);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph shared-mailbox request failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    messages.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? null;
    pages += 1;
  }

  return messages;
}
