import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { StorageNodeData } from "@/types/graph";
import { useSimStore } from "@/store/simStore";

export const StorageNodeComponent = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as StorageNodeData;
  const liveStats = useSimStore((s) => s.liveNodes.find((n) => n.node_id === id));

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 min-w-[140px] cursor-pointer bg-amber-50 shadow-sm
        ${selected ? "border-amber-500 shadow-amber-200 shadow-md" : "border-amber-300"}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-3 !h-3" />
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Storage</span>
        <span className="text-[9px] text-amber-500 font-normal">auto-priority</span>
      </div>
      <div className="text-sm font-semibold text-gray-800 truncate">{d.label}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">
        {d.max_capacity != null ? `Cap: ${d.max_capacity}` : "Unlimited"}
      </div>
      {liveStats && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 text-[11px]">
          <span className="text-gray-500">Stored</span>
          <span className="font-medium text-gray-700">{liveStats.queue_length + liveStats.in_process}</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-3 !h-3" />
    </div>
  );
});

StorageNodeComponent.displayName = "StorageNode";
