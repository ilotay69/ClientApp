import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types";

/** Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Wrapped in React's cache() so every call within the same
 * request/render pass (the dashboard layout, the page under it, any
 * getMyPermissions/hasPermission call either of them makes) gets back the
 * exact same client instance instead of building a fresh one each time —
 * on its own this doesn't save a query, but it's what lets
 * getMyPermissions below actually memoize (its own cache() key is this
 * client's identity, which only stays stable if this does). Cache scope
 * is per-request; a new request (including each Server Action call) gets
 * a fresh one. */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component during render — the middleware
            // below refreshes the session on every request, so this is safe
            // to ignore.
          }
        },
      },
    }
  );
});

/**
 * Same as createClient(), except its cookie writer reports failures instead
 * of swallowing them.
 *
 * Use this from a Server Action or Route Handler that deliberately CHANGES
 * the session — signing in, or stepping up to AAL2 via MFA. Those are the
 * cases where the cookie write is the entire point of the call, so a silent
 * failure is the worst possible outcome: supabase.auth.mfa.verify() would
 * resolve successfully, the caller would navigate to the portal, the portal
 * would still see an AAL1 session, and the client would be bounced back to
 * /portal/mfa forever with no error shown anywhere.
 *
 * createClient()'s silent catch stays as it is, on purpose. Server
 * Components legitimately hit it on every render (cookies() is read-only
 * there), which is exactly the case its comment describes.
 */
export const createMutableClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // No try/catch. If this throws here it is a real bug — a Server
          // Action's cookie store IS writable — and it must surface rather
          // than become an unexplained redirect loop.
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );
});

/** The signed-in auth user, memoized per request.
 *
 * supabase.auth.getUser() is a network round trip to Supabase Auth every
 * time it's called — it validates the JWT server-side rather than just
 * decoding the cookie (which is exactly why it's the one to use, and why
 * calling it repeatedly is expensive). A single page render reaches for
 * the current user from the layout, from the page itself, and from every
 * permission check underneath both; this collapses all of those into one
 * call. Cache scope is per request, same as createClient() above.
 *
 * Note this can't help middleware, which runs outside the React render
 * pass entirely and so gets its own cache scope. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Admin client using the service role key. Bypasses Row Level Security.
 * Server-only — never import this from a Client Component. Used by the
 * reminders cron route, which needs to read across every team member's data.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
