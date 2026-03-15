import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SinkNodeData } from "@/types/graph";
import { useSimStore } from "@/store/simStore";

export const SinkNodeComponent = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as SinkNodeData;
  const liveStats = useSimStore((s) => s.liveNodes.find((n) => n.node_id === id));

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 min-w-[130px] cursor-pointer bg-red-50 shadow-sm
        ${selected ? "border-red-500 shadow-red-200 shadow-md" : "border-red-300"}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-red-500 !w-3 !h-3" />
      <div className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-0.5">Sink</div>
      <div className="text-sm font-semibold text-gray-800 truncate">{d.label}</div>
      {liveStats && (
        <div className="text-[11px] text-gray-500 mt-1">
          Completed: <span className="font-medium text-gray-700">{liveStats.total_completed}</span>
        </div>
      )}
    </div>
  );
});

SinkNodeComponent.displayName = "SinkNode";
