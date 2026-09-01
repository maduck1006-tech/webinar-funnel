import { NextResponse } from "next/server";
import { countSegment, type Segment } from "@/lib/broadcasts";

export const runtime = "nodejs";

/** 세그먼트 조건 → 대상 인원 (관리자 UI 미리보기) */
export async function POST(req: Request) {
  const seg = (await req.json().catch(() => ({}))) as Segment;
  const n = await countSegment(seg).catch(() => 0);
  return NextResponse.json({ count: n });
}
