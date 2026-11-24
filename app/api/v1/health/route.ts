import { ok } from "@/lib/api/response";
import { route } from "@/lib/api/handler";

export const dynamic = "force-dynamic";

/**
 * Liveness probe. Deliberately reports nothing about the database or the
 * tenant set — it is a public endpoint, and uptime checks only need to know
 * that the app is serving.
 */
export const GET = route("health", async () =>
  ok({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  }),
);
