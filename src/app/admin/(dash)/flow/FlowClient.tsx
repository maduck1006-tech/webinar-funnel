"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  FUNNEL_PAGE_TYPES,
  PAGE_META,
  type Exit,
  type FunnelNode,
  type FunnelPageType,
} from "@/lib/flow-types";

type NodeData = {
  pageType: FunnelPageType;
  exits: Exit[];
  campaignId: string;
  basePath: string;
  onRelink: (
    pageType: FunnelPageType,
    blockId: string,
    targetType: string,
  ) => void;
  busy: boolean;
};

const NODE_W = 360;
const GAP = 120;

function FunnelPageNode({ data }: NodeProps<Node<NodeData>>) {
  const meta = PAGE_META[data.pageType];
  const openUrl = `${data.basePath}${meta.path}?preview=1`;
  return (
    <div
      className="rounded-xl border-2 border-zinc-800 bg-white shadow-lg"
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center justify-between border-b bg-zinc-800 px-3 py-2 text-white">
        <span className="text-sm font-bold">
          {meta.step} · {meta.title}
        </span>
        <span className="flex gap-2 text-xs">
          <a
            href={`/admin/builder/${data.campaignId}/${data.pageType}`}
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            편집
          </a>
          <a href={openUrl} className="underline" target="_blank" rel="noreferrer">
            열기
          </a>
        </span>
      </div>

      <div className="h-[260px] overflow-hidden border-b bg-zinc-50">
        <div
          style={{
            width: NODE_W / 0.5,
            height: 520,
            transform: "scale(0.5)",
            transformOrigin: "top left",
          }}
        >
          <iframe
            src={openUrl}
            className="h-full w-full"
            style={{ border: 0, pointerEvents: "none" }}
            title={data.pageType}
          />
        </div>
      </div>

      <div className="space-y-2 p-3">
        {data.exits.length === 0 && (
          <p className="text-xs text-zinc-400">이동 지점 없음</p>
        )}
        {data.exits.map((ex) => (
          <div key={ex.blockId} className="text-xs">
            <p className="mb-1 font-medium text-zinc-600">{ex.label}</p>
            <select
              className="w-full rounded border px-2 py-1"
              disabled={data.busy}
              value={
                ex.targetType ??
                (ex.target && ex.target !== "#" ? "__ext" : "")
              }
              onChange={(e) =>
                data.onRelink(data.pageType, ex.blockId, e.target.value)
              }
            >
              <option value="">— 미설정</option>
              {FUNNEL_PAGE_TYPES.filter((t) => t !== data.pageType).map((t) => (
                <option key={t} value={t}>
                  → {PAGE_META[t].step} {PAGE_META[t].title}
                </option>
              ))}
              <option value="__ext">외부/결제 링크 (그대로)</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = { funnelPage: FunnelPageNode };

export function FlowClient({
  campaignId,
  basePath,
  nodes: funnelNodes,
  systemTransitions,
}: {
  campaignId: string;
  basePath: string;
  nodes: FunnelNode[];
  systemTransitions: { from: FunnelPageType; to: FunnelPageType; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);

  const onRelink = useCallback(
    async (
      pageType: FunnelPageType,
      blockId: string,
      targetType: string,
    ) => {
      setSaving(pageType);
      try {
        await fetch(`/api/campaigns/${campaignId}/pages/${pageType}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blockId,
            targetType: targetType === "__ext" ? "" : targetType,
          }),
        });
        startTransition(() => router.refresh());
      } finally {
        setSaving(null);
      }
    },
    [router, campaignId],
  );

  const rfNodes: Node<NodeData>[] = useMemo(
    () =>
      funnelNodes.map((fn, i) => ({
        id: fn.pageType,
        type: "funnelPage",
        position: { x: i * (NODE_W + GAP), y: 0 },
        data: {
          pageType: fn.pageType,
          exits: fn.exits,
          campaignId,
          basePath,
          onRelink,
          busy: pending || saving === fn.pageType,
        },
      })),
    [funnelNodes, onRelink, pending, saving, campaignId, basePath],
  );

  const rfEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    for (const fn of funnelNodes) {
      for (const ex of fn.exits) {
        if (ex.targetType) {
          edges.push({
            id: `link-${fn.pageType}-${ex.blockId}`,
            source: fn.pageType,
            target: ex.targetType,
            label: ex.label,
            animated: true,
            style: { stroke: "#18181b", strokeWidth: 2 },
          });
        }
      }
    }
    systemTransitions.forEach((t, i) => {
      edges.push({
        id: `sys-${i}`,
        source: t.from,
        target: t.to,
        label: t.label,
        style: { stroke: "#a1a1aa", strokeDasharray: "6 4" },
        labelStyle: { fill: "#71717a", fontSize: 10 },
      });
    });
    return edges;
  }, [funnelNodes, systemTransitions]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      edgesFocusable={false}
    >
      <Background />
      <Controls />
      <MiniMap pannable />
    </ReactFlow>
  );
}
