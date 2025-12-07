import { NextResponse } from "next/server";

type ErrorLikeBody = {
  error: string;
};

export function buildErrorResponse<TBody extends ErrorLikeBody>(
  status: number,
  body: TBody,
  init?: Omit<ResponseInit, "status">,
) {
  return NextResponse.json(body, { status, ...init });
}
