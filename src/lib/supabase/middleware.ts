import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth"];

// Accessible with or without a session — unlike PUBLIC_PATHS above, a
// signed-in visitor is never redirected away from these. A client
// acknowledging a quarterly review has no login at all, but a staff
// member testing the link (or a client who separately holds a portal
// login) must still be able to open it while already signed in.
const PUBLIC_PREFIX_PATHS = ["/quarterly-review-ack"];

// PWA install assets — a browser's installability check (and a service
// worker's own registration) fetches these directly, without necessarily
// carrying the session cookie a normal page navigation would. Gating them
// behind login means the manifest/icons never resolve to real content for
// that check, so the browser never offers "Install app" at all — these must
// stay public exactly like PUBLIC_PATHS above, not just for logged-out
// visitors but for the browser's own internal requests regardless of login
// state.
const PUBLIC_ASSET_PATHS = ["/manifest.webmanifest", "/icon", "/icon-192", "/apple-icon", "/sw.js", "/favicon.ico"];

/**
 * Refreshes the Supabase auth session on every request and redirects
 * unauthenticated users away from protected pages. Called from the root
 * `middleware.ts`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );
  const isPublicAsset = PUBLIC_ASSET_PATHS.some((path) => request.nextUrl.pathname === path);
  const isPublicPrefixPath = PUBLIC_PREFIX_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (
    !user &&
    !isPublicPath &&
    !isPublicAsset &&
    !isPublicPrefixPath &&
    !request.nextUrl.pathname.startsWith("/api")
  ) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // "/" rather than "/dashboard": src/app/page.tsx is the role router, so a
  // client-portal login lands in the portal instead of bouncing through the
  // staff tree first. Deliberately no role lookup here — this runs on every
  // request, and a database query in middleware is the thing we're avoiding.
  if (user && isPublicPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}
