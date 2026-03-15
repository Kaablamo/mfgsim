import { useGraphStore } from "@/store/graphStore";
import { ChevronUp, ChevronDown } from "lucide-react";

const TYPE_COLOR: Record<string, string> = {
  source: "bg-green-500",
  process: "bg-blue-500",
  sink: "bg-red-500",
};

const TYPE_LABEL: Record<string, string> = {
  source: "Source",
  process: "Process",
  sink: "Sink",
};

export function NodeListPanel() {
  const { nodes, selectedNodeId, setSelectedNode, setSelectedEdge, reorderNodes } =
    useGraphStore();

  if (nodes.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Nodes</h3>
        <p className="text-xs text-gray-400 text-center py-4">
          No nodes yet. Add one from the canvas toolbar.
        </p>
      </div>
    );
  }

  function handleSelect(id: string) {
    setSelectedEdge(null);
    setSelectedNode(id);
  }

  return (
    <div className="p-4 space-y-1">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Nodes</h3>

      {nodes.map((node, index) => {
        const label = (node.data as { label?: string })?.label ?? node.id;
        const type = node.type ?? "process";
        const isSelected = node.id === selectedNodeId;

        return (
          <div
            key={node.id}
            onClick={() => handleSelect(node.id)}
            className={`flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer transition-colors ${
              isSelected
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200 bg-gray-50 hover:bg-gray-100"
            }`}
          >
            {/* Type colour indicator */}
            <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_COLOR[type] ?? "bg-gray-400"}`} />

            {/* Label + type badge */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
              <p className="text-xs text-gray-400">{TYPE_LABEL[type] ?? type}</p>
            </div>

            {/* Reorder buttons */}
            <div className="flex flex-col shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                disabled={index === 0}
                onClick={() => reorderNodes(index, index - 1)}
                className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed"
                title="Move up"
              >
                <ChevronUp size={13} />
              </button>
              <button
                disabled={index === nodes.length - 1}
                onClick={() => reorderNodes(index, index + 1)}
                className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ChevronDown size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
