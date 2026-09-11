import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip Next's own static/image assets — updateSession's own
    // PUBLIC_PATHS/PUBLIC_ASSET_PATHS checks handle everything else
    // (login, auth callback, the PWA manifest/icons/service worker, /api).
    "/((?!_next/static|_next/image).*)",
  ],
};
