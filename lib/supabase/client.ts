import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";

import type { Database } from "./types";

/**
 * Browser Supabase client — anon key only, subject to RLS.
 *
 * Used for Realtime subscriptions (the admin dashboard in Phase 4) and for
 * client-side reads that RLS already constrains.
 */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
