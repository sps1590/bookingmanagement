import "server-only";

import { cache } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { clientEnv } from "@/lib/env";

import type { Database } from "./types";

/**
 * An anon client with no session attached, for reads that are public by
 * definition.
 *
 * The booking portal used the cookie-bound client from `./server`, and that
 * had two costs. The small one: reading cookies makes a page dynamic, so
 * Next.js had to render the portal from scratch on every visit even though a
 * business's name, services and providers change a few times a year. With
 * this client the page can be cached and served from the edge, and the
 * settings screens already call `revalidatePath` when any of it changes.
 *
 * The larger one: it meant the portal's output depended on who was looking.
 * An owner browsing their own booking page carried their session into these
 * queries, so RLS answered as that owner — the same URL, different rows, and
 * a cache that could have stored one person's view for everybody. Reading as
 * nobody is both faster and the only version that is actually correct.
 *
 * `persistSession: false` because there is no session to persist and no
 * storage to put it in; without it the client sets up token refresh machinery
 * for an identity that does not exist.
 */
export const publicClient = cache(() =>
  createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
);
