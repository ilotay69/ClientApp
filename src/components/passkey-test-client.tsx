"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Answers one question: what `aal` and `amr` does a Supabase passkey sign-in
 * put in the session JWT? GoTrue decides both server-side, so it cannot be
 * known from the library — only observed. The whole passkey workstream
 * branches on the answer, which is why this runs before any of it is built.
 *
 * Deliberately self-contained: its own browser client carries the
 * experimental passkey flag, so the shared app client stays untouched until
 * the decision is made. This page is the only client on /passkey-test, so
 * the ssr singleton picks up this instance (with the flag) first.
 */
export function PasskeyTestClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [supabase] = useState<any>(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { experimental: { passkey: true } } }
    )
  );

  const [claims, setClaims] = useState<{ aal?: string; amr?: unknown; email?: string } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const say = useCallback((line: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l]), []);

  const readClaims = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const hasSession = Boolean(sessionData.session);
    setSignedIn(hasSession);
    if (!hasSession) {
      setClaims(null);
      return;
    }
    // getClaims() returns the VERIFIED payload. Fall back to decoding the raw
    // access token if it isn't available, so this still reports something.
    let aal: string | undefined;
    let amr: unknown;
    let email: string | undefined;
    try {
      const { data } = await supabase.auth.getClaims();
      const c = data?.claims ?? {};
      aal = c.aal;
      amr = c.amr;
      email = c.email;
    } catch {
      /* fall through to manual decode */
    }
    if (!aal) {
      const token = sessionData.session.access_token as string;
      const payload = JSON.parse(atob(token.split(".")[1]));
      aal = payload.aal;
      amr = payload.amr;
      email = payload.email;
    }
    setClaims({ aal, amr, email });
  }, [supabase]);

  useEffect(() => {
    // setState happens after an await inside readClaims, not synchronously
    // here; the rule can't see past the async boundary. Throwaway page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void readClaims();
  }, [readClaims]);

  const register = async () => {
    say("registerPasskey()…");
    try {
      const { data, error } = await supabase.auth.registerPasskey();
      if (error) say(`register ERROR: ${error.message} (${(error as { code?: string }).code ?? "?"})`);
      else say(`registered passkey ${data?.id ?? "?"} (${data?.friendly_name ?? "unnamed"})`);
    } catch (err) {
      say(`register threw: ${(err as Error).message}`);
    }
    await readClaims();
  };

  const signInWithPasskey = async () => {
    say("signInWithPasskey()…");
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) say(`signin ERROR: ${error.message} (${(error as { code?: string }).code ?? "?"})`);
      else say(`signed in as ${data?.user?.email ?? "?"}`);
    } catch (err) {
      say(`signin threw: ${(err as Error).message}`);
    }
    await readClaims();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    say("signed out");
    await readClaims();
  };

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Passkey aal/amr test (staging only)</h1>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Sign in normally first (password + code), register a passkey, sign out, then sign in with the
        passkey. The box below shows the session&apos;s aal and amr after each step.
      </p>

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0", background: "#f8fafc" }}>
        <strong>Session:</strong> {signedIn ? claims?.email ?? "signed in" : "signed out"}
        <pre style={{ margin: "8px 0 0", fontSize: 14 }}>
{`aal = ${claims?.aal ?? "—"}
amr = ${claims ? JSON.stringify(claims.amr) : "—"}`}
        </pre>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={register} disabled={!signedIn} style={btn}>Register a passkey</button>
        <button onClick={signInWithPasskey} disabled={signedIn} style={btn}>Sign in with a passkey</button>
        <button onClick={signOut} disabled={!signedIn} style={btn}>Sign out</button>
        <button onClick={() => void readClaims()} style={btn}>Refresh claims</button>
      </div>

      <pre style={{ marginTop: 16, fontSize: 12, color: "#334155", whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>
    </div>
  );
}

const btn: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 14,
  cursor: "pointer",
  background: "white",
};
