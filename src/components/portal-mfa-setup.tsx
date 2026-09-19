"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { verifyMfaCodeAction } from "@/app/portal/mfa/actions";

/**
 * TOTP enrolment and step-up verification for a client-portal login.
 *
 * enroll() stays in the browser: it returns the QR image and shared secret,
 * which only the browser needs, and it takes no user input. challenge() and
 * verify() moved to a Server Action — see verifyMfaCodeAction for why.
 *
 * The code field submits itself on the sixth digit. Two guards keep that
 * from becoming a retry loop on a wrong code, and they cover different
 * races: `busy` stops a second submit while one is in flight, and
 * `lastSubmittedRef` stops the effect re-firing for the SAME six digits
 * when busy flips back to false. Without the second one, one wrong code
 * would resubmit continuously and burn Supabase's 15-per-minute MFA limit
 * in about a second — locking out the legitimate user, from a bug on our
 * side. Clearing the field on failure makes the loop structurally
 * impossible rather than only guarded against.
 */
export function PortalMfaSetup({ mode }: { mode: "enrol" | "verify" }) {
  const router = useRouter();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Verify mode has nothing to fetch any more: the action resolves the
  // factor server-side, so the old listFactors() round trip (and the dead
  // permanently-disabled button it left behind when it failed) are both gone.
  const [loading, setLoading] = useState(mode === "enrol");
  const [attempt, setAttempt] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastSubmittedRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== "enrol") return;
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      // An abandoned first attempt leaves an unverified factor behind, and
      // enroll() then fails because a factor already exists. Clear those
      // out so a client who closed the tab can simply start again.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const factor of existing?.all ?? []) {
        if (factor.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }

      const { data, error: enrolError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (cancelled) return;
      if (enrolError || !data) {
        setError(enrolError?.message ?? "Could not start authenticator setup.");
        setLoading(false);
        return;
      }
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrolled(true);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, attempt]);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      setError(null);

      const result = await verifyMfaCodeAction({ code: value });

      if (!result.ok) {
        setError(result.error);
        setCode("");
        // Reset so retyping the same code submits again — without this, a
        // client who re-enters the code they just mistyped would find the
        // form silently does nothing.
        lastSubmittedRef.current = null;
        setBusy(false);
        inputRef.current?.focus();
        return;
      }

      // Session is AAL2 now, and its cookies are already on this response.
      // refresh() makes the server re-read them before we navigate, so the
      // portal doesn't bounce straight back here. Deliberately no
      // setBusy(false) — navigation is in flight, and flipping the button
      // back to "Verify" would look like nothing happened.
      router.refresh();
      router.replace("/portal");
    },
    [router]
  );

  const trySubmit = useCallback(
    (value: string) => {
      if (busy || value.length !== 6 || lastSubmittedRef.current === value) return;
      lastSubmittedRef.current = value;
      void submit(value);
    },
    [busy, submit]
  );

  // Auto-submit lives in an effect rather than in onChange because React
  // batches state updates: the effect gives one deterministic trigger per
  // value, and it also catches a programmatic autofill, which sets the
  // field with no keystroke at all.
  useEffect(() => {
    trySubmit(code);
  }, [code, trySubmit]);

  const showForm = mode === "verify" || enrolled;

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
              <p className="mt-2">Enter this key into your authenticator app by hand:</p>
              <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800">
                {secret}
              </code>
            </details>
          )}
        </div>
      )}

      {showForm ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            trySubmit(code);
          }}
          className="mt-6 space-y-4"
        >
          <div>
            <label htmlFor="mfa-code" className="block text-sm font-medium text-slate-700">
              6-digit code
            </label>
            <input
              ref={inputRef}
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              // Stripping non-digits here handles paste for free: "123 456"
              // and "Your code is 123456" both collapse to six digits. A
              // separate onPaste handler would fire before the value updates
              // in some browsers, which is a reliable source of bugs.
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-describedby={error ? "mfa-error" : undefined}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-slate-500 focus:outline-none"
            />
          </div>

          {error && (
            <p id="mfa-error" role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {/* With auto-submit, a sighted user sees the button change state
              but a screen-reader user would otherwise get nothing at all. */}
          <p aria-live="polite" className="sr-only">
            {busy ? "Verifying your code" : ""}
          </p>

          {/* Kept, not removed. Auto-submit is the convenience; this is the
              keyboard and assistive-tech fallback, and the escape hatch when
              autofill lands six digits and the effect does not fire. */}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "Verifying…" : mode === "enrol" ? "Finish setup" : "Verify"}
          </button>
        </form>
      ) : (
        !loading &&
        error && (
          <div className="mt-6 space-y-3">
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
            {/* Previously this state rendered the form with a permanently
                disabled button — a dead end with no way out. */}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setLoading(true);
                setAttempt((a) => a + 1);
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Try again
            </button>
          </div>
        )
      )}
    </div>
  );
}
