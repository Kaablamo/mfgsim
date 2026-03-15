import { useState } from "react";
import { usePartStore } from "@/store/partStore";
import { PartForm } from "./PartForm";
import type { PartDefinition } from "@/types/parts";
import { Pencil, Trash2, Plus } from "lucide-react";

export function PartsPanel() {
  const { parts, deletePart } = usePartStore();
  const [editing, setEditing] = useState<PartDefinition | null | "new">(null);

  if (editing) {
    return (
      <PartForm
        existing={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Parts</h3>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {parts.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">
          No parts defined. Add one to label part flows.
        </p>
      )}

      {parts.map((p) => (
        <div
          key={p.id}
          className="flex items-start justify-between rounded border border-gray-200 p-2.5 bg-gray-50"
        >
          <div>
            <p className="text-sm font-medium text-gray-800">{p.name}</p>
            {p.number && (
              <p className="text-xs text-gray-500">{p.number}</p>
            )}
          </div>
          <div className="flex gap-1 ml-2 shrink-0">
            <button
              onClick={() => setEditing(p)}
              className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => deletePart(p.id)}
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
