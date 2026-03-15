import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ProcessNodeData } from "@/types/graph";
import { useSimStore } from "@/store/simStore";
import { usePartStore } from "@/store/partStore";
import { useWorkcenterStore } from "@/store/workcenterStore";

export const ProcessNodeComponent = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as ProcessNodeData;
  const liveStats = useSimStore((s) => s.liveNodes.find((n) => n.node_id === id));
  const parts = usePartStore((s) => s.parts);
  const workcenters = useWorkcenterStore((s) => s.workcenters);

  const inputNames = (d.input_parts ?? [])
    .map((pid) => parts.find((p) => p.id === pid)?.name)
    .filter(Boolean) as string[];
  const outputName = d.output_part ? parts.find((p) => p.id === d.output_part)?.name : undefined;
  const wc = d.workcenter_id ? workcenters.find((w) => w.id === d.workcenter_id) : undefined;

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 min-w-[160px] cursor-pointer bg-blue-50 shadow-sm
        ${selected ? "border-blue-500 shadow-blue-200 shadow-md" : "border-blue-300"}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-3 !h-3" />
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Process</span>
        {d.priority && d.priority !== "medium" && (
          <span className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded ${
            d.priority === "bottleneck" ? "bg-red-100 text-red-700" :
            d.priority === "high"       ? "bg-orange-100 text-orange-700" :
                                          "bg-gray-100 text-gray-500"
          }`}>
            {d.priority === "bottleneck" ? "BN" : d.priority === "high" ? "HI" : "LO"}
          </span>
        )}
      </div>
      <div className="text-sm font-semibold text-gray-800 truncate">{d.label}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">
        {(d.batch_size ?? 1) > 1 || (d.min_batch_size ?? 1) > 1
          ? `Batch ${d.batch_size ?? 1} (min ${d.min_batch_size ?? 1})`
          : `Cap: ${d.capacity ?? 1}`}
        &nbsp;|&nbsp;
        {d.duration?.type === "fixed"
          ? `${d.duration.value ?? "?"} units`
          : `${d.duration?.type ?? "?"} dist.`}
      </div>
      {(d.max_infeed != null || d.max_outfeed != null) && (
        <div className="flex gap-1 mt-1">
          {d.max_infeed === 0 ? (
            // No infeed area — routing avoids when anyone is queued
            <span className="text-[9px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded">IN:none</span>
          ) : d.max_infeed != null ? (
            // Limited infeed
            <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded">IN:{d.max_infeed}</span>
          ) : null}
          {d.max_outfeed != null && d.max_outfeed > 0 && (
            <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded">OUT:{d.max_outfeed}</span>
          )}
        </div>
      )}
      {liveStats && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 text-[11px]">
          <span className="text-gray-500">Queue</span>
          <span className="font-medium text-gray-700">{liveStats.queue_length}</span>
          <span className="text-gray-500">Util.</span>
          <span className="font-medium text-gray-700">{(liveStats.utilization * 100).toFixed(0)}%</span>
        </div>
      )}
      {d.fallout_rate != null && d.fallout_rate > 0 && (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1 py-0.5 rounded uppercase tracking-wide">
            Rework {(d.fallout_rate * 100).toFixed(1)}%
          </span>
        </div>
      )}
      {wc && (
        <div className="mt-1 text-[9px] bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded truncate">
          ⬡ {wc.name}
        </div>
      )}
      {(inputNames.length > 0 || outputName) && (
        <div className="mt-1 flex items-center gap-0.5 text-[9px] text-gray-400 truncate">
          <span className="truncate max-w-[64px]">{inputNames.join(", ") || "?"}</span>
          <span className="mx-0.5">→</span>
          <span className="truncate max-w-[64px]">{outputName ?? "?"}</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-3 !h-3" />
      {d.fallout_rate != null && d.fallout_rate > 0 && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="fallout-out"
          className="!bg-red-500 !w-3 !h-3"
        />
      )}
    </div>
  );
});

ProcessNodeComponent.displayName = "ProcessNode";
