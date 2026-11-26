/**
 * What to tell somebody whose form the database refused.
 *
 * Every settings action used to answer "That could not be saved." That is the
 * worst sentence in the product: it is true of a duplicate name, a missing
 * permission, a plan limit and a dropped connection alike, so it tells the
 * person nothing about which of those just happened or what to do next. The
 * owner who could not add a third doctor met exactly this — the database said
 * "this plan allows 2", and the screen said nothing at all.
 *
 * The rules this reads are all server-side and stay server-side. This only
 * decides how to say what came back.
 *
 *   BK001  a deliberate refusal raised by our own functions. MESSAGE holds a
 *          canonical code and DETAIL holds the sentence written for a human,
 *          so DETAIL is the answer whenever there is one.
 *   23505  a unique index. Two services called "Consultation", usually.
 *   23503  a foreign key — the row points at something that is not there.
 *   23514  a CHECK constraint: the value itself is out of range.
 *   42501  and PostgREST's own permission codes: Row-Level Security refused.
 *          Not "wrong", but "not yours", which is a different sentence.
 *
 * Anything unrecognised keeps a plain fallback rather than leaking a Postgres
 * message into the interface: `details` can carry column names, constraint
 * names and sometimes the offending row, none of which belong on a screen a
 * receptionist is looking at.
 */

export interface WriteErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

export function describeWriteError(
  error: WriteErrorLike | null | undefined,
  fallback = "That could not be saved.",
): string {
  if (!error) return fallback;

  const code = error.code ?? "";

  // Our own refusals already carry a sentence meant for this screen.
  if (code === "BK001") {
    return error.details?.trim() || fallback;
  }

  switch (code) {
    case "23505":
      return "Something with that name already exists. Use a different one.";
    case "23503":
      return "That refers to something which no longer exists. Reload and try again.";
    case "23514":
      return "One of those values is out of range. Check it and try again.";
    case "42501":
    case "PGRST301":
    case "PGRST116":
      return "You do not have permission to change that.";
    case "22P02":
      return "One of those values is not in the right format.";
    default:
      return fallback;
  }
}
