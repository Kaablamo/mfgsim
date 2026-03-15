import { useState } from "react";
import { useResourceStore } from "@/store/resourceStore";
import { useGraphStore } from "@/store/graphStore";
import { useTravelStore } from "@/store/travelStore";

export function ResourceMappingPanel() {
  const resources = useResourceStore((s) => s.resources);
  const nodes = useGraphStore((s) => s.nodes);
  const { matrix, setTime } = useTravelStore();
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [symmetric, setSymmetric] = useState(true);

  // Process and storage nodes both appear in the routing matrix
  const routingNodes = nodes.filter((n) => n.type === "process" || n.type === "storage");

  // Determine which resource to show
  const resourceId = selectedResourceId || resources[0]?.id || "";
  const selectedResource = resources.find((r) => r.id === resourceId);

  function handleTimeChange(fromId: string, toId: string, raw: string) {
    const value = parseFloat(raw);
    const time = isNaN(value) || value < 0 ? 0 : value;
    setTime(resourceId, fromId, toId, time);
    if (symmetric) {
      setTime(resourceId, toId, fromId, time);
    }
  }

  function getTime(fromId: string, toId: string): string {
    const t = matrix[resourceId]?.[fromId]?.[toId];
    return t && t > 0 ? String(t) : "";
  }

  // Empty states
  if (resources.length === 0) {
    return (
      <EmptyState message="No resources defined. Add a resource in the Model Editor first." />
    );
  }
  if (routingNodes.length === 0) {
    return (
      <EmptyState message="No process or storage nodes in the model. Add nodes in the Model Editor first." />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-6 px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Resource Routing Times
        </p>

        {/* Resource selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Resource</label>
          <select
            value={resourceId}
            onChange={(e) => setSelectedResourceId(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm bg-white"
          >
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (×{r.quantity})
              </option>
            ))}
          </select>
        </div>

        {/* Symmetric toggle */}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={symmetric}
            onChange={(e) => setSymmetric(e.target.checked)}
            className="rounded"
          />
          Symmetric (A→B also sets B→A)
        </label>

        {selectedResource && selectedResource.quantity > 1 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Qty &gt; 1: travel uses shared last-location tracking (approximate)
          </p>
        )}
      </div>

      {/* Matrix table */}
      <div className="flex-1 overflow-auto p-5">
        <div className="inline-block">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                {/* Corner cell */}
                <th className="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 text-left min-w-[140px]">
                  From \ To
                </th>
                {routingNodes.map((col) => (
                  <th
                    key={col.id}
                    className={`border border-gray-200 px-3 py-2 text-xs font-semibold text-center min-w-[110px] whitespace-nowrap ${
                      col.type === "storage"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {(col.data as { label?: string }).label || col.id}
                    {col.type === "storage" && (
                      <span className="block text-[9px] font-normal text-amber-500 uppercase tracking-wider">storage</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routingNodes.map((row) => (
                <tr key={row.id}>
                  {/* Row header */}
                  <td className={`sticky left-0 z-10 border border-gray-200 px-3 py-2 text-xs font-semibold whitespace-nowrap ${
                    row.type === "storage" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"
                  }`}>
                    {(row.data as { label?: string }).label || row.id}
                    {row.type === "storage" && (
                      <span className="ml-1 text-[9px] font-normal text-amber-400 uppercase tracking-wider">(storage)</span>
                    )}
                  </td>
                  {routingNodes.map((col) => {
                    const isSelf = row.id === col.id;
                    return (
                      <td
                        key={col.id}
                        className={`border border-gray-200 p-1 text-center ${
                          isSelf ? "bg-gray-100" : "bg-white"
                        }`}
                      >
                        {isSelf ? (
                          <span className="text-gray-300 select-none">—</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={getTime(row.id, col.id)}
                            onChange={(e) => handleTimeChange(row.id, col.id, e.target.value)}
                            placeholder="0"
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm text-center focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Enter travel time in simulation units. Leave blank or 0 for no travel time.
          Travel time is added to resource utilization (the resource is occupied while moving).
        </p>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-gray-400 bg-gray-50">
      {message}
    </div>
  );
}
