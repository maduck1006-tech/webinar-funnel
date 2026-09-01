import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { phone, code } = (await req.json().catch(() => ({}))) as {
    phone?: string;
    code?: string;
  };
  const r = await verifyOtp(String(phone ?? ""), String(code ?? ""));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
