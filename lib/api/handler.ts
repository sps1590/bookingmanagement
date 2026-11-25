import { randomUUID } from "node:crypto";

import { ZodError, type ZodType } from "zod";

import { logger } from "@/lib/logger";

import { ApiError, ErrorCode } from "./errors";
import { fail, failFrom } from "./response";

/**
 * Wraps a route handler so that every `/api/v1/*` route gets the same
 * request id, timing log and error envelope, and so no raw stack trace or
 * Postgres message ever reaches a customer.
 */
export function route<Args extends unknown[]>(
  name: string,
  // `Response`, not `NextResponse`: the export endpoints return a file with
  // its own content type and disposition, and wrapping those in a JSON
  // envelope helper would mean either a second wrapper with no request id and
  // no error handling, or a download that arrives as JSON.
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const startedAt = Date.now();

    try {
      const response = await handler(request, ...args);
      response.headers.set("x-request-id", requestId);
      logger.info("request.completed", {
        route: name,
        requestId,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      if (error instanceof ApiError) {
        // Expected outcomes (slot taken, cutoff passed) are information, not faults.
        logger.warn("request.rejected", {
          route: name,
          requestId,
          durationMs,
          code: error.code,
        });
        const response = failFrom(error);
        response.headers.set("x-request-id", requestId);
        return response;
      }

      if (error instanceof ZodError) {
        logger.warn("request.invalid", { route: name, requestId, durationMs });
        const response = fail(
          ErrorCode.VALIDATION_FAILED,
          "The request body or query parameters are invalid.",
          error.issues,
        );
        response.headers.set("x-request-id", requestId);
        return response;
      }

      logger.error("request.failed", { route: name, requestId, durationMs, error });
      const response = fail(
        ErrorCode.INTERNAL,
        "Something went wrong on our side. Please try again.",
      );
      response.headers.set("x-request-id", requestId);
      return response;
    }
  };
}

/** Parse a JSON body, raising a `VALIDATION_FAILED` envelope on bad input. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(ErrorCode.VALIDATION_FAILED, "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

/** Parse query parameters from the request URL. */
export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return schema.parse(params);
}
