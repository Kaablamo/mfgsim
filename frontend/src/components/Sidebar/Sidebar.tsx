import { useState, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";
import { SourceConfig } from "./SourceConfig";
import { ProcessConfig } from "./ProcessConfig";
import { SinkConfig } from "./SinkConfig";
import { StorageConfig } from "./StorageConfig";
import { EdgeConfig } from "./EdgeConfig";
import type { SourceNodeData, ProcessNodeData, SinkNodeData, StorageNodeData } from "@/types/graph";

// Nodes with a distribution to preview get the expanded chart panel
const EXPANDABLE = new Set(["source", "process"]);

export function Sidebar() {
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const { nodes, selectedNodeId, edges, selectedEdgeId } = useGraphStore();
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  const canExpand = !!selectedNode && EXPANDABLE.has(selectedNode.type ?? "");
  const expanded = hovered && canExpand;

  // 256 px base → 480 px expanded (chart panel grows to the left of the form)
  const sidebarWidth = expanded ? 480 : 256;

  function handleEnter() {
    clearTimeout(leaveTimer.current);
    setHovered(true);
  }
  function handleLeave() {
    // Short delay prevents flicker when the mouse briefly exits while the
    // sidebar is still animating its width.
    leaveTimer.current = setTimeout(() => setHovered(false), 150);
  }

  // Edge selected — show edge config (no expand animation for edges)
  if (selectedEdge) {
    return (
      <div
        className="border-l border-gray-200 bg-white flex flex-col overflow-hidden"
        style={{ width: 256 }}
      >
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Edge Properties</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <EdgeConfig key={selectedEdge.id} edgeId={selectedEdge.id} />
        </div>
      </div>
    );
  }

  if (!selectedNode) {
    return (
      <div
        className="border-l border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-center transition-[width] duration-200 ease-out"
        style={{ width: sidebarWidth }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <p className="text-sm text-gray-400">Select a node or edge to configure it.</p>
      </div>
    );
  }

  return (
    <div
      className="border-l border-gray-200 bg-white flex flex-col overflow-hidden transition-[width] duration-200 ease-out"
      style={{ width: sidebarWidth }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Node Properties</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 min-w-0">
        {selectedNode.type === "source" && (
          <SourceConfig
            key={selectedNode.id}
            nodeId={selectedNode.id}
            data={selectedNode.data as unknown as SourceNodeData}
            expanded={expanded}
          />
        )}
        {selectedNode.type === "process" && (
          <ProcessConfig
            key={selectedNode.id}
            nodeId={selectedNode.id}
            data={selectedNode.data as unknown as ProcessNodeData}
            expanded={expanded}
          />
        )}
        {selectedNode.type === "sink" && (
          <SinkConfig
            key={selectedNode.id}
            nodeId={selectedNode.id}
            data={selectedNode.data as unknown as SinkNodeData}
          />
        )}
        {selectedNode.type === "storage" && (
          <StorageConfig
            key={selectedNode.id}
            nodeId={selectedNode.id}
            data={selectedNode.data as unknown as StorageNodeData}
          />
        )}
      </div>
    </div>
  );
}
