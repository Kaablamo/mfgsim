import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { Copy } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useResourceStore } from "@/store/resourceStore";
import { usePartStore } from "@/store/partStore";
import { useWorkcenterStore } from "@/store/workcenterStore";
import type { ProcessNodeData } from "@/types/graph";
import { DistributionPicker } from "@/components/common/DistributionPicker";
import { DistributionChart } from "@/components/common/DistributionChart";

interface Props {
  nodeId: string;
  data: ProcessNodeData;
  expanded?: boolean;
}

export function ProcessConfig({ nodeId, data, expanded = false }: Props) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const duplicateNode = useGraphStore((s) => s.duplicateNode);
  const resources = useResourceStore((s) => s.resources);
  const parts = usePartStore((s) => s.parts);
  const workcenters = useWorkcenterStore((s) => s.workcenters);
  const methods = useForm<ProcessNodeData>({ defaultValues: data });
  const { register, reset, watch, setValue, control } = methods;
  const values = useWatch({ control }) as ProcessNodeData;
  const lastCommitted = useRef("");

  // Part I/O local state (managed outside react-hook-form; merged on submit)
  const [inputParts, setInputParts] = useState<string[]>(
    data.input_parts?.length ? data.input_parts : [""]
  );
  const [outputPart, setOutputPart] = useState<string>(data.output_part ?? "");

  const batchSize = watch("batch_size") ?? 1;
  const minBatchSize = watch("min_batch_size") ?? 1;
  const batchEnabled = batchSize > 1 || minBatchSize > 1;
  const falloutEnabled = (watch("fallout_rate") ?? 0) > 0;

  function handleBatchToggle(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setValue("batch_size", 8);
      setValue("min_batch_size", 1);
    } else {
      setValue("batch_size", 1);
      setValue("min_batch_size", 1);
    }
  }

  useEffect(() => {
    reset(data);
    setInputParts(data.input_parts?.length ? data.input_parts : [""]);
    setOutputPart(data.output_part ?? "");
    lastCommitted.current = JSON.stringify(normalizeProcess(data, data.input_parts ?? [""], data.output_part ?? ""));
  }, [nodeId, reset]);

  useEffect(() => {
    const normalized = normalizeProcess(values, inputParts, outputPart);
    const serialized = JSON.stringify(normalized);
    if (serialized === lastCommitted.current) {
      return;
    }
    lastCommitted.current = serialized;
    updateNodeData(nodeId, normalized);
  }, [inputParts, nodeId, outputPart, updateNodeData, values]);

  const PRIORITY_OPTIONS = [
    { value: "bottleneck", label: "Bottleneck", desc: "Always fed first — protects system throughput" },
    { value: "high",       label: "High",       desc: "Fed before medium and low priority stations" },
    { value: "medium",     label: "Medium",     desc: "Standard routing (default)" },
    { value: "low",        label: "Low",        desc: "Fed only after higher-priority stations are satisfied" },
  ] as const;

  const form = (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Name</label>
        <input
          {...register("label")}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {/* Routing Priority */}
      <div>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Routing Priority</label>
        <p className="text-[11px] text-gray-400 mt-0.5 mb-1">
          Controls which station upstream nodes prefer to feed first
        </p>
        <select
          {...register("priority")}
          defaultValue="medium"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
        >
          {PRIORITY_OPTIONS.map(({ value, label, desc }) => (
            <option key={value} value={value}>{label} — {desc}</option>
          ))}
        </select>
      </div>

      {/* Resource assignment */}
      <div className="rounded-md border border-gray-200 p-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-700 mb-2">Resource Assignment</p>
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Resource</label>
        <p className="text-[11px] text-gray-400 mt-0.5 mb-1">
          Which resource operates or supplies this station
        </p>
        <select
          {...register("resource_id")}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
        >
          <option value="">None (automated / no resource)</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>{r.name} (×{r.quantity})</option>
          ))}
        </select>
      </div>

      {/* Workcenter Assignment */}
      {workcenters.length > 0 && (
        <div className="rounded-md border border-gray-200 p-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700 mb-1">Workcenter</p>
          <p className="text-[11px] text-gray-400 mb-2">
            Groups co-located steps — only N parts active in this workcenter simultaneously
          </p>
          <select
            {...register("workcenter_id")}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
          >
            <option value="">— None —</option>
            {workcenters.map((wc) => (
              <option key={wc.id} value={wc.id}>
                {wc.name} (cap: {wc.capacity})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Part I/O */}
      {parts.length > 0 && (
        <div className="rounded-md border border-gray-200 p-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700 mb-2">Part I/O</p>

          {/* Input Parts */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Input Parts</label>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-1">Parts consumed by this process</p>
            <div className="space-y-1">
              {inputParts.map((partId, idx) => (
                <div key={idx} className="flex gap-1">
                  <select
                    value={partId}
                    onChange={(e) => {
                      const next = [...inputParts];
                      next[idx] = e.target.value;
                      setInputParts(next);
                    }}
                    className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="">— Select Part —</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.number ? ` (${p.number})` : ""}
                      </option>
                    ))}
                  </select>
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => setInputParts(inputParts.filter((_, i) => i !== idx))}
                      className="px-2 rounded border border-gray-300 text-gray-400 hover:text-red-600 hover:border-red-300 text-sm"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {inputParts.length < 3 && (
              <button
                type="button"
                onClick={() => setInputParts([...inputParts, ""])}
                className="mt-1.5 text-[11px] text-blue-600 hover:text-blue-800 font-medium"
              >
                ＋ Add Input
              </button>
            )}
          </div>

          {/* Output Part */}
          <div>
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Output Part</label>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-1">Part produced by this process</p>
            <select
              value={outputPart}
              onChange={(e) => setOutputPart(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">— Select Part —</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.number ? ` (${p.number})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Batch Processing */}
      <div className="rounded-md border border-gray-200 p-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-700 mb-2">Batch Processing</p>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={batchEnabled}
            onChange={handleBatchToggle}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Enable batch processing</span>
        </label>
        {batchEnabled && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Batch Size</label>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-1">Max parts processed per cycle</p>
              <input
                type="number"
                min={1}
                step={1}
                {...register("batch_size", { valueAsNumber: true, min: 1 })}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Min. Start Quantity</label>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-1">Parts in queue before batch starts</p>
              <input
                type="number"
                min={1}
                step={1}
                {...register("min_batch_size", { valueAsNumber: true, min: 1 })}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* WIP Buffers */}
      <div className="rounded-md border border-gray-200 p-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-700 mb-1">WIP Buffers</p>
        <p className="text-[11px] text-gray-400 mb-3">
          Internal storage at this station. Travel time to/from these buffers is 0.
        </p>

        {/* Infeed */}
        <div className="mb-3">
          <label className="flex items-center gap-2 cursor-pointer select-none mb-1">
            <input
              type="checkbox"
              checked={(watch("max_infeed") ?? 1) !== 0}
              onChange={(e) => {
                // Checked → allow infeed (unlimited until user sets a qty)
                // Unchecked → max_infeed=0 = no infeed area
                if (e.target.checked) setValue("max_infeed", undefined as never);
                else setValue("max_infeed", 0);
              }}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Allow Infeed WIP</span>
          </label>
          {(watch("max_infeed") ?? 1) !== 0 ? (
            <div className="ml-6">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Infeed Qty</label>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-1">
                Max parts waiting — leave blank for unlimited
              </p>
              <input
                type="number"
                min={1}
                step={1}
                placeholder="Unlimited"
                {...register("max_infeed", { valueAsNumber: true, min: 1 })}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm placeholder:text-gray-300"
              />
            </div>
          ) : (
            <p className="ml-6 text-[11px] text-gray-400">
              No infeed area — parts route here only when the server is immediately free.
            </p>
          )}
        </div>

        {/* Outfeed */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer select-none mb-1">
            <input
              type="checkbox"
              checked={(watch("max_outfeed") ?? null) !== null}
              onChange={(e) => {
                // Checked → outfeed area exists, unlimited (0) until user sets a qty
                // Unchecked → no outfeed buffer (undefined)
                if (e.target.checked) setValue("max_outfeed", 0 as never);
                else setValue("max_outfeed", undefined as never);
              }}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Allow Outfeed WIP</span>
          </label>
          {(watch("max_outfeed") ?? null) !== null ? (
            <div className="ml-6">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Outfeed Qty</label>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-1">
                Max finished parts held here — station blocks when full. Leave blank for unlimited.
              </p>
              <input
                type="number"
                min={1}
                step={1}
                placeholder="Unlimited"
                value={(watch("max_outfeed") || "") as number | ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  setValue("max_outfeed", (raw === "" ? 0 : Number(raw)) as never);
                }}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm placeholder:text-gray-300"
              />
            </div>
          ) : (
            <p className="ml-6 text-[11px] text-gray-400">
              No outfeed buffer — parts route immediately after processing.
            </p>
          )}
        </div>
      </div>

      {/* Fallout / Rework */}
      <div className="rounded-md border border-gray-200 p-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-700 mb-1">Fallout / Rework</p>
        <p className="text-[11px] text-gray-400 mb-2">
          Parts that fail route out of the red handle at the bottom of the node.
          Connect it back to any upstream node to model a rework loop.
        </p>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={falloutEnabled}
            onChange={(e) => {
              setValue("fallout_rate", e.target.checked ? 0.04 : 0);
            }}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Enable Fallout</span>
        </label>
        {falloutEnabled && (
          <div className="mt-3">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              Fallout Rate (%)
            </label>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-1">
              Percentage of parts that fail and are reworked
            </p>
            <input
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={Number(((watch("fallout_rate") ?? 0) * 100).toFixed(1))}
              onChange={(e) => {
                const pct = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                setValue("fallout_rate", parseFloat((pct / 100).toFixed(4)));
              }}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        )}
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">Processing Time</p>
        <DistributionPicker fieldPrefix="duration" />
      </div>

      <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
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

  return (
    <FormProvider {...methods}>
      {expanded ? (
        <div className="flex min-w-0">
          {/* Chart expands to the LEFT; form stays anchored at the right edge */}
          <div className="flex-1 min-w-0 pr-4 border-r border-gray-100 flex flex-col justify-end">
            <DistributionChart fieldPrefix="duration" />
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

function normalizeProcess(
  values: ProcessNodeData,
  inputParts: string[],
  outputPart: string,
): Partial<ProcessNodeData> {
  const infeed = values.max_infeed === 0
    ? 0
    : normalizeOptionalInteger(values.max_infeed);
  const outfeed = values.max_outfeed === undefined
    ? undefined
    : normalizeOptionalInteger(values.max_outfeed) ?? 0;

  return {
    ...values,
    capacity: normalizePositiveInteger(values.capacity, 1),
    batch_size: normalizePositiveInteger(values.batch_size, 1),
    min_batch_size: normalizePositiveInteger(values.min_batch_size, 1),
    resource_id: (values.resource_id as string) || undefined,
    resource_performs_process: true,
    max_infeed: infeed,
    max_outfeed: outfeed,
    fallout_rate: normalizeOptionalNumber(values.fallout_rate) ?? 0,
    input_parts: inputParts.filter(Boolean),
    output_part: outputPart || undefined,
    workcenter_id: (values.workcenter_id as string) || undefined,
    duration: normalizeDistribution(values.duration),
  };
}

function normalizeDistribution(dist: ProcessNodeData["duration"]) {
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
