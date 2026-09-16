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
