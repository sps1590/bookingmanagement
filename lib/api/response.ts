import { NextResponse } from "next/server";

import { ApiError, ErrorCode, statusForCode } from "./errors";

/**
 * Uniform response envelope for every `/api/v1/*` route.
 *
 * Spec §3.3 shows `{ success: true, data: {...} }`; this keeps the failure
 * shape equally predictable so the client never has to guess.
 */
export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = {
  success: false;
  error: { code: ErrorCode; message: string; details?: unknown };
};
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json<ApiSuccess<T>>(
    { success: true, data },
    { status: init?.status ?? 200, headers: init?.headers },
  );
}

export function created<T>(data: T) {
  return ok(data, { status: 201 });
}

export function fail(code: ErrorCode, message: string, details?: unknown) {
  return NextResponse.json<ApiFailure>(
    { success: false, error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status: statusForCode(code) },
  );
}

export function failFrom(error: ApiError) {
  return fail(error.code, error.message, error.details);
}
