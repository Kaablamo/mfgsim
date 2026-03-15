import { useEffect, useRef } from "react";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { Copy } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { usePartStore } from "@/store/partStore";
import type { SourceNodeData } from "@/types/graph";
import { DistributionPicker } from "@/components/common/DistributionPicker";
import { DistributionChart } from "@/components/common/DistributionChart";

interface Props {
  nodeId: string;
  data: SourceNodeData;
  expanded?: boolean;
}

export function SourceConfig({ nodeId, data, expanded = false }: Props) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const duplicateNode = useGraphStore((s) => s.duplicateNode);
  const parts = usePartStore((s) => s.parts);
  const methods = useForm<SourceNodeData>({ defaultValues: data });
  const { register, reset, control } = methods;
  const values = useWatch({ control }) as SourceNodeData;
  const lastCommitted = useRef("");

  useEffect(() => {
    reset(data);
    lastCommitted.current = JSON.stringify(normalizeSource(data));
  }, [nodeId, reset]);

  useEffect(() => {
    const normalized = normalizeSource(values);
    const serialized = JSON.stringify(normalized);
    if (serialized === lastCommitted.current) {
      return;
    }
    lastCommitted.current = serialized;
    updateNodeData(nodeId, normalized);
  }, [nodeId, updateNodeData, values]);

  const form = (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Name</label>
        <input
          {...register("label")}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Entity Type</label>
        <input
          {...register("entity_type")}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Batch Size</label>
        <input
          type="number"
          min={1}
          step={1}
          {...register("batch_size", { valueAsNumber: true })}
          placeholder="1"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Max Entities</label>
        <input
          type="number"
          {...register("max_entities", { valueAsNumber: true })}
          placeholder="Unlimited"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>
      {parts.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Output Part</label>
          <p className="text-[11px] text-gray-400 mt-0.5 mb-1">Part produced at this source</p>
          <select
            {...register("output_part")}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
          >
            <option value="">— None —</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.number ? ` (${p.number})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">Inter-Arrival Time</p>
        <DistributionPicker fieldPrefix="inter_arrival" />
      </div>
      <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        Changes save automatically.
      </p>
      <button
        type="button"
        onClick={() => duplicateNode(nodeId)}
        className="w-full flex items-center justify-center gap-1.5 rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        <Copy size={13} /> Duplicate
      </button>
    </div>
  );

  return (
    <FormProvider {...methods}>
      {expanded ? (
        <div className="flex min-w-0">
          {/* Chart expands to the LEFT; form stays anchored at the right edge */}
          <div className="flex-1 min-w-0 pr-4 border-r border-gray-100">
            <DistributionChart fieldPrefix="inter_arrival" />
          </div>
          <div className="flex-shrink-0 pl-4" style={{ width: 224 }}>
            {form}
          </div>
        </div>
      ) : (
        form
      )}
    </FormProvider>
  );
}

function normalizeSource(values: SourceNodeData): Partial<SourceNodeData> {
  return {
    ...values,
    batch_size: normalizePositiveInteger(values.batch_size, 1),
    max_entities: normalizeOptionalInteger(values.max_entities),
    output_part: (values.output_part as string) || undefined,
    inter_arrival: normalizeDistribution(values.inter_arrival),
  };
}

function normalizeDistribution(dist: SourceNodeData["inter_arrival"]) {
  return {
    ...dist,
    value: normalizeOptionalNumber(dist?.value),
    mean: normalizeOptionalNumber(dist?.mean),
    std: normalizeOptionalNumber(dist?.std),
    low: normalizeOptionalNumber(dist?.low),
    high: normalizeOptionalNumber(dist?.high),
    mode: normalizeOptionalNumber(dist?.mode),
    scale: normalizeOptionalNumber(dist?.scale),
    shape: normalizeOptionalNumber(dist?.shape),
  };
}

function normalizeOptionalNumber(value: number | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) {
    return undefined;
  }
  return value;
}

function normalizeOptionalInteger(value: number | undefined): number | undefined {
  const normalized = normalizeOptionalNumber(value);
  return normalized == null ? undefined : Math.trunc(normalized);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  const normalized = normalizeOptionalInteger(value);
  if (normalized == null || normalized < 1) {
    return fallback;
  }
  return normalized;
}
