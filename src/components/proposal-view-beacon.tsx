"use client";

import { useEffect, useRef } from "react";

/** Records that a human actually looked at the proposal.
 *
 * Deliberately not the server render. Outlook Safe Links, Proofpoint,
 * Mimecast, Barracuda and the Teams/Slack link unfurlers all GET this page
 * the moment the email arrives — counting those would mean a proposal shows
 * "opened" before the recipient has even seen the email, and "opened 4
 * times" would stop meaning anything. Since none of them execute JavaScript
 * or stay on the page, requiring both a mount and a few seconds of dwell
 * filters essentially all of them out.
 *
 * The action itself does the rest: a repeat inside a short window doesn't
 * increment the count (so a reload isn't a second read), and a bot-looking
 * user agent is logged but never counted. */
export function ProposalViewBeacon({
  token,
  recordAction,
}: {
  token: string;
  recordAction: (token: string, userAgent: string) => Promise<void>;
}) {
  // Survives React 18/19's double-invoked effects in development, and any
  // re-render, so one page view never fires two beacons.
  const fired = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (fired.current) return;
      fired.current = true;
      // Failure here must never surface to the prospect — this is
      // analytics sitting underneath a sales document.
      void recordAction(token, navigator.userAgent).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [token, recordAction]);

  return null;
}
