"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type AuthState } from "./actions";
import { MicrosoftSignInButton } from "@/components/microsoft-sign-in-button";
import { TurnstileWidget } from "@/components/turnstile-widget";

const initialState: AuthState = { error: null };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  // "/" is the role router — it sends staff to the dashboard and a portal
  // login to the portal, so this default doesn't have to know which is which.
  const next = searchParams.get("next") ?? "/";
  const [state, formAction, pending] = useActionState(signIn, initialState);

  // The Turnstile token rides along in a hidden field. A token is single-use
  // and Supabase consumes it on verify, so after every completed submit the
  // widget is reset for a fresh one — otherwise the next attempt fails on a
  // stale token and reads as a wrong password. Keyed on a submit COMPLETING
  // (pending going true→false) rather than on the error text, so two
  // identical errors in a row still each trigger a fresh token. Adjusted
  // during render, React's blessed pattern for reacting to changed state,
  // with a ref guard so it runs once per completion and can't loop.
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  // Previous pending value held in state (not a ref), the documented pattern
  // for reacting to a changed value during render. When a submit completes
  // (pending true→false) the widget is reset for a fresh single-use token.
  const [prevPending, setPrevPending] = useState(false);
  if (prevPending !== pending) {
    setPrevPending(pending);
    if (!pending) setResetSignal((n) => n + 1);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cg-logo.svg" alt="CG Technologies" className="h-8 w-auto" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">
          CG Ops
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Sign in with your CG Technologies account.
        </p>

        <div className="mt-6">
          <MicrosoftSignInButton next={next} />
        </div>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="captchaToken" value={captchaToken} />
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <TurnstileWidget onToken={(t) => setCaptchaToken(t ?? "")} resetSignal={resetSignal} />

          {state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Need an account? Ask an Owner to create one for you.
        </p>
      </div>
    </div>
  );
}
