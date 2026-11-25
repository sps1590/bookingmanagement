import "server-only";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { getMemberContext, type MemberContext } from "@/lib/auth/session";

/**
 * The gate every `/api/v1/admin/*` route passes through.
 *
 * ## Why the tenant is never taken from the request
 *
 * The plan asks for an `X-Business-ID` header and says to assert it matches a
 * real membership. This goes further and does not read the header as an input
 * at all: the tenant comes from the caller's own membership row, fetched under
 * Row-Level Security. A header that is merely *checked* still invites the
 * check to be forgotten in the next route somebody adds, and the failure is
 * silent and total — one missing comparison and a signed-in user of tenant A
 * is operating on tenant B.
 *
 * The header is still honoured when present, but only to *disambiguate* among
 * memberships the caller already has, and a mismatch is a 403 rather than a
 * quiet fallback. Today there is one membership per user (enforced in
 * `register_business`), so this matters for the tenant switcher rather than
 * for now — which is exactly when a rule like this gets written or doesn't.
 *
 * ## Roles
 *
 * `owner` and `manager` administer; `receptionist` runs the desk; `staff` sees
 * their own column of the diary. These are the same four the RLS policies
 * test, deliberately: a guard here that disagreed with the database would
 * either block work the policies allow — confusing but safe — or allow work
 * the policies then refuse, which surfaces as an unexplained error halfway
 * through an operation.
 *
 * This is defence in depth, not the defence. RLS is still what stops a
 * cross-tenant read; this turns "the query returned nothing" into a clear 403.
 */

export type Role = MemberContext["role"];

export const DESK: readonly Role[] = ["owner", "manager", "receptionist"];
export const ADMIN: readonly Role[] = ["owner", "manager"];
export const ANY_MEMBER: readonly Role[] = ["owner", "manager", "receptionist", "staff"];

export async function requireRole(
  request: Request,
  roles: readonly Role[] = ANY_MEMBER,
): Promise<MemberContext> {
  const context = await getMemberContext();

  if (!context) {
    throw new ApiError(ErrorCode.UNAUTHENTICATED, "Please sign in.");
  }

  const claimed = request.headers.get("x-business-id");
  if (claimed && claimed !== context.businessId) {
    // Not a redirect to the right tenant, and not a silent correction: a
    // request naming a business the caller is not a member of is either a bug
    // in the client or an attempt, and both deserve the same answer.
    throw new ApiError(ErrorCode.FORBIDDEN, "You are not a member of that business.");
  }

  if (!roles.includes(context.role)) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      "Your role does not allow that. Ask an owner or manager.",
    );
  }

  return context;
}
