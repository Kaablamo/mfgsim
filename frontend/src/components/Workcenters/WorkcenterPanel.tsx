import { useState } from "react";
import { useWorkcenterStore } from "@/store/workcenterStore";
import { WorkcenterForm } from "./WorkcenterForm";
import type { WorkcenterModel } from "@/types/workcenter";
import { Pencil, Trash2, Plus } from "lucide-react";

export function WorkcenterPanel() {
  const { workcenters, deleteWorkcenter } = useWorkcenterStore();
  const [editing, setEditing] = useState<WorkcenterModel | null | "new">(null);

  if (editing) {
    return (
      <WorkcenterForm
        existing={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Workcenters</h3>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {workcenters.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">
          No workcenters defined. Add one to group co-located process steps.
        </p>
      )}

      {workcenters.map((wc) => (
        <div
          key={wc.id}
          className="flex items-start justify-between rounded border border-gray-200 p-2.5 bg-gray-50"
        >
          <div>
            <p className="text-sm font-medium text-gray-800">{wc.name}</p>
            <p className="text-xs text-gray-500">Capacity: {wc.capacity}</p>
          </div>
          <div className="flex gap-1 ml-2 shrink-0">
            <button
              onClick={() => setEditing(wc)}
              className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => deleteWorkcenter(wc.id)}
              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
