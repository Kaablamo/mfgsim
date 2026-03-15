import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Copy } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import type { SinkNodeData } from "@/types/graph";

interface Props {
  nodeId: string;
  data: SinkNodeData;
}

export function SinkConfig({ nodeId, data }: Props) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const duplicateNode = useGraphStore((s) => s.duplicateNode);
  const { register, reset, control } = useForm<SinkNodeData>({ defaultValues: data });
  const values = useWatch({ control }) as SinkNodeData;
  const lastCommitted = useRef("");

  useEffect(() => {
    reset(data);
    lastCommitted.current = JSON.stringify(values ?? data);
  }, [nodeId, reset]);

  useEffect(() => {
    const serialized = JSON.stringify(values);
    if (serialized === lastCommitted.current) {
      return;
    }
    lastCommitted.current = serialized;
    updateNodeData(nodeId, values);
  }, [nodeId, updateNodeData, values]);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Name</label>
        <input
          {...register("label")}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
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
