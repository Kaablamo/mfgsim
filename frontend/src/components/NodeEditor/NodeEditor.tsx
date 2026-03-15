import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useGraphStore } from "@/store/graphStore";
import { SourceNodeComponent } from "./nodes/SourceNode";
import { ProcessNodeComponent } from "./nodes/ProcessNode";
import { SinkNodeComponent } from "./nodes/SinkNode";
import { StorageNodeComponent } from "./nodes/StorageNode";
import { NodeToolbar } from "./NodeToolbar";

const nodeTypes: NodeTypes = {
  source: SourceNodeComponent as never,
  process: ProcessNodeComponent as never,
  sink: SinkNodeComponent as never,
  storage: StorageNodeComponent as never,
};

function getMiniMapNodeColor(type?: string): string {
  if (type === "source") return "#86efac";
  if (type === "process") return "#93c5fd";
  if (type === "storage") return "#fcd34d";
  return "#fca5a5";
}

export function NodeEditor() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setSelectedNode, setSelectedEdge } =
    useGraphStore();

  function handleNodeClick(_event: unknown, node: Node) {
    setSelectedNode(node.id);
    setSelectedEdge(null);
  }

  function handleEdgeClick(_event: unknown, edge: { id: string }) {
    setSelectedEdge(edge.id);
    setSelectedNode(null);
  }

  function handlePaneClick() {
    setSelectedNode(null);
    setSelectedEdge(null);
  }

  return (
    <div className="flex flex-col h-full">
      <NodeToolbar />
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          fitView
          deleteKeyCode="Delete"
          snapToGrid
          snapGrid={[16, 16]}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e5e7eb" />
          <Controls />
          <MiniMap
            nodeColor={(node) => getMiniMapNodeColor(node.type)}
            maskColor="rgba(240,242,247,0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
