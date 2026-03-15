import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Copy } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import type { StorageNodeData } from "@/types/graph";

interface Props {
  nodeId: string;
  data: StorageNodeData;
}

export function StorageConfig({ nodeId, data }: Props) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const duplicateNode = useGraphStore((s) => s.duplicateNode);
  const { register, reset, watch, control } = useForm<StorageNodeData>({ defaultValues: data });
  const values = useWatch({ control }) as StorageNodeData;
  const lastCommitted = useRef("");

  useEffect(() => {
    reset(data);
    lastCommitted.current = JSON.stringify(normalizeStorage(data));
  }, [nodeId, reset]);

  useEffect(() => {
    const normalized = normalizeStorage(values);
    const serialized = JSON.stringify(normalized);
    if (serialized === lastCommitted.current) {
      return;
    }
    lastCommitted.current = serialized;
    updateNodeData(nodeId, normalized);
  }, [nodeId, updateNodeData, values]);

  const hasCapLimit = watch("max_capacity");

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Name</label>
        <input
          {...register("label")}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {/* Auto-priority info */}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-semibold text-amber-700 mb-1">Priority — Auto-inferred</p>
        <p className="text-[11px] text-amber-600 leading-relaxed">
          Storage priority is computed at runtime from its downstream connections.
          While a downstream node's queue is below its minimum batch size, this buffer
          gets priority just below that node. Once the downstream is adequately fed,
          priority drops to below&nbsp;"Low" so other paths are preferred.
        </p>
      </div>

      {/* Capacity Limit */}
      <div className="rounded-md border border-gray-200 p-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-700 mb-1">Capacity Limit</p>
        <p className="text-[11px] text-gray-400 mb-2">
          When the buffer holds this many parts, upstream routing avoids sending more here.
          Leave blank for unlimited.
        </p>
        <input
          type="number"
          min={1}
          step={1}
          placeholder="Unlimited"
          {...register("max_capacity", { valueAsNumber: true, min: 1 })}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
        {hasCapLimit && (
          <p className="text-[10px] text-amber-600 mt-1">
            Soft limit — routing prefers other paths when at capacity.
          </p>
        )}
      </div>

      <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Changes save automatically.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => duplicateNode(nodeId)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <Copy size={13} /> Duplicate
        </button>
        <button
          type="button"
          onClick={() => deleteNode(nodeId)}
          className="flex-1 rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function normalizeStorage(values: StorageNodeData): Partial<StorageNodeData> {
  return {
    ...values,
    max_capacity: normalizeOptionalInteger(values.max_capacity),
  };
}

function normalizeOptionalInteger(value: number | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) {
    return undefined;
  }
  return Math.trunc(value);
}
