"use client";

import { useRef, useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { config } from "@/puck/config";
import type { FunnelData } from "@/puck/defaults";
import type { PageType } from "@/db/schema";

export function BuilderClient({
  campaignId,
  campaignName,
  pageType,
  variant = "a",
  pageLabel,
  initialData,
}: {
  campaignId: string;
  campaignName: string;
  pageType: PageType;
  variant?: "a" | "b";
  pageLabel: string;
  initialData: FunnelData;
}) {
  const current = useRef<FunnelData>(initialData);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(publish: boolean) {
    setMsg("저장 중...");
    const q = variant === "b" ? "?variant=b" : "";
    const res = await fetch(
      `/api/campaigns/${campaignId}/pages/${pageType}${q}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: current.current, publish }),
      },
    );
    setMsg(res.ok ? (publish ? "발행 완료" : "임시저장 완료") : "저장 실패");
  }

  return (
    <Puck
      config={config}
      data={initialData}
      onChange={(d) => {
        current.current = d;
      }}
      onPublish={() => save(true)}
      headerTitle={`${campaignName} · ${pageLabel}`}
      overrides={{
        headerActions: ({ children }) => (
          <>
            <a
              href={`/admin/campaigns/${campaignId}`}
              className="mr-3 self-center text-sm text-zinc-500 hover:text-zinc-900"
            >
              ← 캠페인
            </a>
            {msg && <span className="mr-3 self-center text-sm">{msg}</span>}
            <button
              type="button"
              className="mr-2 rounded-md border px-3 py-1.5 text-sm"
              onClick={() => save(false)}
            >
              임시저장
            </button>
            {children}
          </>
        ),
      }}
    />
  );
}
