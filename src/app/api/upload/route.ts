import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { reportError } from "@/lib/report";

export const runtime = "nodejs";

// 관리자 이미지 업로드 (middleware 로 보호됨). 최대 10MB 이미지.
const MAX = 10 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN 미설정" },
      { status: 500 },
    );
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file 필요" }, { status: 400 });
    }
    if (file.size > MAX) {
      return NextResponse.json({ error: "10MB 초과" }, { status: 413 });
    }
    if (file.type && !OK_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "이미지 파일만" }, { status: 415 });
    }
    const ext = file.name.split(".").pop() || "jpg";
    const blob = await put(`funnel/${crypto.randomUUID()}.${ext}`, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type || "image/jpeg",
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    reportError("upload", e);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}
