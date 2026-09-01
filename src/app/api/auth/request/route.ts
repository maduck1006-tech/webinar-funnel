import { NextResponse } from "next/server";
import { requestOtp } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { phone } = (await req.json().catch(() => ({}))) as { phone?: string };
  const r = await requestOtp(String(phone ?? ""));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
