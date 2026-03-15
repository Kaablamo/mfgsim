import { useGraphStore, nextNodeId } from "@/store/graphStore";
import type { SourceNodeData, ProcessNodeData, SinkNodeData, StorageNodeData } from "@/types/graph";
import type { AppNode } from "@/store/graphStore";

const NODE_TYPES = [
  { type: "source",  label: "Source",  color: "bg-green-100 border-green-400 text-green-700" },
  { type: "process", label: "Process", color: "bg-blue-100 border-blue-400 text-blue-700" },
  { type: "storage", label: "Storage", color: "bg-amber-100 border-amber-400 text-amber-700" },
  { type: "sink",    label: "Sink",    color: "bg-red-100 border-red-400 text-red-700" },
] as const;

function defaultData(type: "source" | "process" | "sink" | "storage"): SourceNodeData | ProcessNodeData | SinkNodeData | StorageNodeData {
  if (type === "source") {
    return {
      label: "Source",
      inter_arrival: { type: "fixed", value: 1 },
      entity_type: "Entity",
    };
  }
  if (type === "process") {
    return {
      label: "Process",
      duration: { type: "fixed", value: 1 },
      capacity: 1,
      resource_performs_process: true,
    };
  }
  if (type === "storage") {
    return {
      label: "Storage",
      priority: "medium",
    };
  }
  return { label: "Sink" };
}

export function NodeToolbar() {
  const addNode = useGraphStore((s) => s.addNode);

  function handleAdd(type: "source" | "process" | "sink" | "storage") {
    const id = nextNodeId();
    const node: AppNode = {
      id,
      type,
      position: { x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 },
      data: defaultData(type) as never,
    };
    addNode(node);
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-white border-b border-gray-200">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">Add Node:</span>
      {NODE_TYPES.map(({ type, label, color }) => (
        <button
          key={type}
          onClick={() => handleAdd(type)}
          className={`px-3 py-1.5 rounded border text-xs font-medium transition-opacity hover:opacity-80 ${color}`}
        >
          + {label}
        </button>
      ))}
    </div>
  );
}
