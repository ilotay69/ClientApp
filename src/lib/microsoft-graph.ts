// Minimal Microsoft Graph + Azure AD OAuth helpers. No SDK — Microsoft's v2.0
// endpoint is plain HTTPS, which keeps this dependency-free.

const AUTHORITY = () =>
  `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`;

/** Scopes requested for the "connect my mailbox" flow (not the login flow). */
export const MAIL_SCOPES = "openid offline_access User.Read Mail.Read";

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
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
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
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
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

type MailFolderSummary = { id: string; displayName: string };

async function listMailFolders(accessToken: string, url: string): Promise<MailFolderSummary[]> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Failed to list mail folders (${res.status})`);
  }
  const json = await res.json();
  return json.value ?? [];
}

/**
 * Finds a folder by its exact display name (case-insensitive) — checks
 * top-level folders first, then Inbox's child folders (the common place
 * for a custom triage folder like "Active Inbox"). Returns null if not
 * found rather than throwing, since this folder is optional.
 */
export async function findFolderIdByDisplayName(
  accessToken: string,
  displayName: string
): Promise<string | null> {
  const target = displayName.toLowerCase();

  const topLevel = await listMailFolders(
    accessToken,
    "https://graph.microsoft.com/v1.0/me/mailFolders?$top=100"
  );
  const topMatch = topLevel.find((f) => f.displayName.toLowerCase() === target);
  if (topMatch) return topMatch.id;

  const inboxChildren = await listMailFolders(
    accessToken,
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/childFolders?$top=100"
  );
  return inboxChildren.find((f) => f.displayName.toLowerCase() === target)?.id ?? null;
}

/**
 * Fetches messages from one specific folder only — used for the live,
 * non-persisted mailbox review, which is scoped to a small, explicit set
 * of folders (Inbox, Sent Items, a named custom folder) rather than the
 * whole mailbox. `folder` is either a well-known name Graph accepts
 * directly ("inbox", "sentitems") or a folder id from
 * findFolderIdByDisplayName. Pulls conversationId/parentFolderId too, so
 * the caller can group messages into threads.
 */
export async function fetchMessagesInFolder(
  accessToken: string,
  folder: string,
  sinceIso: string,
  maxPages = 5
): Promise<{ messages: MailboxSnapshotMessage[]; hitPageCap: boolean }> {
  const base = new URL(`https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages`);
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
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
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
