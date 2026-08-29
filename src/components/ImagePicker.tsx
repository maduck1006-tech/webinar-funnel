"use client";

import { useRef, useState } from "react";

/** 관리자 폼용 이미지 업로드 필드 (hidden input 에 URL 저장) */
export function ImagePicker({
  name,
  defaultValue = "",
  label = "이미지",
}: {
  name: string;
  defaultValue?: string;
  label?: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (res.ok) setUrl(json.url);
      else alert(json.error ?? "업로드 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="block">
      <span className="text-xs text-zinc-500">{label}</span>
      <input type="hidden" name={name} value={url} />
      <div className="mt-1 flex items-center gap-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-14 w-14 rounded-lg border object-cover"
          />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-lg border border-dashed text-[10px] text-zinc-400">
            없음
          </div>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-md border px-2 py-1 text-xs"
        >
          {busy ? "업로드 중…" : url ? "교체" : "업로드"}
        </button>
        {url && (
          <button
            type="button"
            onClick={() => setUrl("")}
            className="text-xs text-zinc-500 underline"
          >
            삭제
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
