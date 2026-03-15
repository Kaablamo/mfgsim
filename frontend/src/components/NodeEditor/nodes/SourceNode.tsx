import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SourceNodeData } from "@/types/graph";
import { usePartStore } from "@/store/partStore";

export const SourceNodeComponent = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as SourceNodeData;
  const parts = usePartStore((s) => s.parts);
  const outputName = d.output_part ? parts.find((p) => p.id === d.output_part)?.name : undefined;

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 min-w-[140px] cursor-pointer bg-green-50 shadow-sm
        ${selected ? "border-green-500 shadow-green-200 shadow-md" : "border-green-300"}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-green-600 mb-0.5">Source</div>
      <div className="text-sm font-semibold text-gray-800 truncate">{d.label}</div>
      <div className="text-[11px] text-gray-500 mt-1">
        {d.inter_arrival?.type === "fixed"
          ? `Every ${d.inter_arrival.value ?? "?"} units`
          : `${d.inter_arrival?.type ?? "??"} dist.`}
      </div>
      {outputName && (
        <div className="mt-1 text-[9px] text-green-600 truncate">→ {outputName}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-green-500 !w-3 !h-3" />
    </div>
  );
});

SourceNodeComponent.displayName = "SourceNode";
