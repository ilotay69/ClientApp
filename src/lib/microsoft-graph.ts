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
