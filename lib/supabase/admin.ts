import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { clientEnv, serverEnv } from "@/lib/env";

import type { Database } from "./types";

/**
 * Service-role Supabase client. **Bypasses Row-Level Security entirely.**
 *
 * The `server-only` import above makes the build fail if this module is ever
 * pulled into a Client Component, which is the single most dangerous mistake
 * available in this codebase: the service-role key in a browser bundle hands
 * every tenant's patient records to anyone who opens devtools.
 *
 * Legitimate callers are narrow and should stay narrow:
 *   - tenant signup, which must write across tables before any membership row
 *     exists (Phase 1)
 *   - the notification queue worker (Phase 5)
 *   - payment webhooks, which arrive with no user session (Phase 8)
 *   - the Super Admin console, which is cross-tenant by definition (Phase 9)
 *
 * Anything else belongs in `./server.ts` under RLS. When you do use this
 * client, scope every query by `business_id` yourself — nothing else will.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
