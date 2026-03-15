import { create } from "zustand";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from "@xyflow/react";
import type { GraphModel, SourceNodeData, ProcessNodeData, SinkNodeData, StorageNodeData } from "@/types/graph";

export type AppNode = Node<SourceNodeData | ProcessNodeData | SinkNodeData | StorageNodeData>;
export type AppEdge = Edge<{ resource_id?: string; transport_batch_size?: number }>;

interface GraphStore {
  nodes: AppNode[];
  edges: AppEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (node: AppNode) => void;
  updateNodeData: (nodeId: string, data: Partial<SourceNodeData | ProcessNodeData | SinkNodeData | StorageNodeData>) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;
  updateEdgeData: (edgeId: string, patch: { resource_id?: string; transport_batch_size?: number }) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  reorderNodes: (fromIndex: number, toIndex: number) => void;

  exportGraph: () => GraphModel;
  loadGraph: (graph: GraphModel) => void;
  clearGraph: () => void;
}

let _nodeCounter = 0;
export const nextNodeId = () => `node_${++_nodeCounter}`;

/** Advance the counter past any node_N IDs already in the list. */
function syncCounter(nodes: { id: string }[]): void {
  for (const n of nodes) {
    const m = n.id.match(/^node_(\d+)$/);
    if (m) _nodeCounter = Math.max(_nodeCounter, parseInt(m[1], 10));
  }
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes as never, s.nodes) as AppNode[] })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) as AppEdge[] })),

  onConnect: (connection: Connection) =>
    set((s) => ({
      edges: addEdge({ ...connection, id: `edge_${Date.now()}` }, s.edges) as AppEdge[],
    })),

  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),

  updateNodeData: (nodeId, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
      ),
    })),

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  setSelectedEdge: (id) => set({ selectedEdgeId: id }),

  updateEdgeData: (edgeId, patch) =>
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === edgeId ? { ...e, data: { ...e.data, ...patch } } : e
      ),
    })),

  deleteNode: (id) =>
    set((s) => {
      const removedEdgeIds = new Set(
        s.edges.filter((e) => e.source === id || e.target === id).map((e) => e.id)
      );
      return {
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => !removedEdgeIds.has(e.id)),
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        selectedEdgeId: removedEdgeIds.has(s.selectedEdgeId ?? "") ? null : s.selectedEdgeId,
      };
    }),

  duplicateNode: (id) => {
    const src = get().nodes.find((n) => n.id === id);
    if (!src) return;
    const newId = nextNodeId();
    const newNode: AppNode = {
      ...src,
      id: newId,
      position: { x: src.position.x + 40, y: src.position.y + 40 },
      selected: false,
    };
    set((s) => ({ nodes: [...s.nodes, newNode], selectedNodeId: newId }));
  },

  reorderNodes: (fromIndex, toIndex) =>
    set((s) => {
      const nodes = [...s.nodes];
      const [moved] = nodes.splice(fromIndex, 1);
      nodes.splice(toIndex, 0, moved);
      return { nodes };
    }),

  exportGraph: (): GraphModel => {
    const { nodes, edges } = get();
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as "source" | "process" | "sink" | "storage",
        position: n.position,
        data: n.data as never,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        source_handle: e.sourceHandle ?? undefined,
        target_handle: e.targetHandle ?? undefined,
        resource_id: e.data?.resource_id ?? undefined,
        transport_batch_size: e.data?.transport_batch_size ?? undefined,
      })),
    };
  },

  loadGraph: (graph) => {
    const nodes = graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as never,
    }));
    syncCounter(nodes);
    set({
      nodes,
      edges: graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.source_handle,
        targetHandle: e.target_handle,
        data: { resource_id: e.resource_id, transport_batch_size: e.transport_batch_size },
      })),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  clearGraph: () => {
    _nodeCounter = 0;
    set({ nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null });
  },
}));
