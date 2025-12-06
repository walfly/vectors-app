import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Embeddings API is not implemented yet." },
    { status: 501 }
  );
}
