"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * TOTP enrolment and step-up verification for a client-portal login.
 *
 * Uses Supabase's own MFA API, so there's no new dependency and no
 * hand-rolled crypto: enroll() returns the QR image and the shared secret,
 * challenge()+verify() confirms a code and raises the session to AAL2.
 * getPortalContext() refuses to hand out any client data below AAL2.
 */
export function PortalMfaSetup({ mode }: { mode: "enrol" | "verify" }) {
  const router = useRouter();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      if (mode === "enrol") {
        // An abandoned first attempt leaves an unverified factor behind, and
        // enroll() then fails because a factor already exists. Clear those
        // out so a client who closed the tab can simply start again.
        const { data: existing } = await supabase.auth.mfa.listFactors();
        for (const factor of existing?.all ?? []) {
          if (factor.status === "unverified") {
            await supabase.auth.mfa.unenroll({ factorId: factor.id });
          }
        }

        const { data, error: enrolError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
        });
        if (cancelled) return;
        if (enrolError || !data) {
          setError(enrolError?.message ?? "Could not start authenticator setup.");
          setLoading(false);
          return;
        }
        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setLoading(false);
        return;
      }

      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (listError) {
        setError(listError.message);
        setLoading(false);
        return;
      }
      const verified = data?.totp?.[0];
      if (!verified) {
        setError("No authenticator is set up on this account yet.");
        setLoading(false);
        return;
      }
      setFactorId(verified.id);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;

    const supabase = createClient();
    setBusy(true);
    setError(null);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError || !challenge) {
      setError(challengeError?.message ?? "Could not verify that code.");
      setBusy(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.replace(/\s/g, ""),
    });
    if (verifyError) {
      setError(verifyError.message);
      setBusy(false);
      return;
    }

    // The session is AAL2 now. refresh() makes the server re-read it before
    // we navigate, so the portal doesn't bounce straight back here.
    router.refresh();
    router.replace("/portal");
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">
        {mode === "enrol" ? "Set up two-factor authentication" : "Enter your code"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {mode === "enrol"
          ? "Scan this with an authenticator app — Microsoft Authenticator, Google Authenticator, 1Password or similar — then enter the 6-digit code it shows."
          : "Open your authenticator app and enter the current 6-digit code."}
      </p>

      {loading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

      {mode === "enrol" && qrCode && (
        <div className="mt-6 space-y-3">
          <div className="flex justify-center rounded-lg border border-slate-200 bg-white p-4">
            {/* Supabase has returned this as both an SVG document and a data
                URI across versions, so handle either rather than betting on
                one. */}
            {qrCode.trimStart().startsWith("<svg") ? (
              <div
                className="h-44 w-44 [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrCode }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrCode} alt="Authenticator QR code" className="h-44 w-44" />
            )}
          </div>
          {secret && (
            <details className="text-sm text-slate-500">
              <summary className="cursor-pointer">Can&apos;t scan the code?</summary>
              <p className="mt-2">
                Enter this key into your authenticator app by hand:
              </p>
              <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800">
                {secret}
              </code>
            </details>
          )}
        </div>
      )}

      {(factorId || error) && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              6-digit code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-slate-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy || !factorId}
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "Verifying…" : mode === "enrol" ? "Finish setup" : "Continue"}
          </button>
        </form>
      )}
    </div>
  );
}
