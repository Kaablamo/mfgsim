import { useGraphStore } from "@/store/graphStore";
import { useResourceStore } from "@/store/resourceStore";
import { useTravelStore } from "@/store/travelStore";

interface Props {
  edgeId: string;
}

export function EdgeConfig({ edgeId }: Props) {
  const { edges, nodes, updateEdgeData } = useGraphStore();
  const resources = useResourceStore((s) => s.resources);
  const matrix = useTravelStore((s) => s.matrix);

  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const sourceLabel = (sourceNode?.data as { label?: string })?.label ?? edge.source;
  const targetLabel = (targetNode?.data as { label?: string })?.label ?? edge.target;

  const selectedResourceId = edge.data?.resource_id ?? "";
  const travelTime = selectedResourceId
    ? (matrix[selectedResourceId]?.[edge.source]?.[edge.target] ?? 0)
    : 0;
  const batchSize = edge.data?.transport_batch_size ?? 1;

  function handleResourceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    updateEdgeData(edgeId, { resource_id: e.target.value || undefined });
  }

  function handleBatchSizeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Math.max(1, parseInt(e.target.value, 10) || 1);
    updateEdgeData(edgeId, { transport_batch_size: v > 1 ? v : undefined });
  }

  return (
    <div className="space-y-4">
      {/* Route */}
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Route</label>
        <p className="mt-1 text-sm text-gray-700">
          {sourceLabel} <span className="text-gray-400">→</span> {targetLabel}
        </p>
      </div>

      {/* Transport Resource */}
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Transport Resource
        </label>
        <select
          value={selectedResourceId}
          onChange={handleResourceChange}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">None (instant transfer)</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* Batch size — only relevant when a transport resource is assigned */}
      {selectedResourceId && (
        <div>
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            Batch Size
          </label>
          <p className="mt-0.5 text-[10px] text-gray-400">
            Parts carried per trip. Resource is acquired once for the whole batch.
          </p>
          <input
            type="number"
            min={1}
            value={batchSize}
            onChange={handleBatchSizeChange}
            className="mt-1 w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
      )}

      {/* Travel time preview */}
      {selectedResourceId && (
        <div className="rounded bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
          Travel time from Routing tab:{" "}
          <span className="font-medium text-gray-800">
            {travelTime > 0 ? `${travelTime} units` : "not set"}
          </span>
        </div>
      )}
    </div>
  );
}
