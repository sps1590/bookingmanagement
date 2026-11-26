import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv } from "@/lib/env";

import type { Database } from "./types";

/**
 * Request-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers.
 *
 * Uses the anon key and the caller's session cookie, so every query runs under
 * Row-Level Security as that user. This is the client almost all server code
 * should use: RLS is the tenant isolation boundary, and bypassing it is how
 * cross-tenant leaks happen.
 *
 * One client per request, via `cache()`. A single console page used to build
 * four or five of these — the layout, the page, the session lookup, each data
 * loader — and every one re-read the cookie jar and stood up its own auth
 * client with its own token state. Sharing one is both cheaper and less
 * surprising: a session refresh written by a Server Action is now visible to
 * everything else in the same request rather than to whichever client happened
 * to perform it.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
            // Called from a Server Component, where cookies are read-only.
            // `middleware.ts` refreshes the session where it can be written.
          }
        },
      },
    },
  );
});
