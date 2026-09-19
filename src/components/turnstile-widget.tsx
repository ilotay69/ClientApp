"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile, explicit-render.
 *
 * Renders nothing at all until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so this
 * component can ship and sit dormant. The moment the key is configured it
 * starts producing tokens; the Supabase dashboard toggle that makes the token
 * MANDATORY is the last step, flipped only after this is confirmed working —
 * enabling it first makes every sign-in fail with "captcha required".
 *
 * Rendered unconditionally on the login form (not only for some accounts): a
 * widget that appeared only for known emails would itself be an
 * account-existence oracle.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget({
  onToken,
  /** Bumping this number resets the widget for a fresh token — the parent
   * does it after a failed submit, because a token is single-use and is
   * consumed the moment Supabase verifies it. */
  resetSignal = 0,
}: {
  onToken: (token: string | null) => void;
  resetSignal?: number;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return; // already rendered
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        // A token lives ~5 minutes; clear it when it lapses so a stale one is
        // never submitted (which fails as "invalid token" and reads to the
        // user as a wrong password).
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };

    if (window.turnstile) {
      render();
    } else if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = render;
      document.head.appendChild(script);
    } else {
      // Script tag exists but hasn't finished loading — poll briefly.
      const t = setInterval(() => {
        if (window.turnstile) {
          clearInterval(t);
          render();
        }
      }, 100);
      return () => clearInterval(t);
    }

    return () => {
      cancelled = true;
    };
  }, [siteKey, onToken]);

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onToken(null);
    }
  }, [resetSignal, onToken]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="mt-2" />;
}
