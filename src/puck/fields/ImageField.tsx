"use client";

import { useRef, useState } from "react";
import type { CustomField } from "@puckeditor/core";

/** Puck 커스텀 필드: 이미지 업로드(Vercel Blob) + URL 직접입력 */
export const imageField: CustomField<string> = {
  type: "custom",
  render: ({ value, onChange }) => <ImageInput value={value} onChange={onChange} />,
};

function ImageInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "업로드 실패");
      onChange(json.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          style={{
            width: "100%",
            maxHeight: 160,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
          }}
        />
      ) : (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            height: 96,
            borderRadius: 8,
            border: "1px dashed #cbd5e1",
            color: "#94a3b8",
            fontSize: 12,
          }}
        >
          이미지 없음
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            background: "#fff",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {busy ? "업로드 중…" : value ? "이미지 교체" : "이미지 업로드"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            삭제
          </button>
        )}
      </div>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="또는 이미지 URL 붙여넣기"
        style={{
          padding: "6px 8px",
          borderRadius: 6,
          border: "1px solid #e2e8f0",
          fontSize: 12,
        }}
      />
      {err && <p style={{ color: "#dc2626", fontSize: 11 }}>{err}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
