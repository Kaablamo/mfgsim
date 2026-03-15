import { useState } from "react";
import { useSimApi } from "@/hooks/useSimApi";
import { useSimStore } from "@/store/simStore";
import { useGraphStore } from "@/store/graphStore";
import { useResourceStore } from "@/store/resourceStore";
import { usePartStore } from "@/store/partStore";
import { useWorkcenterStore } from "@/store/workcenterStore";
import { useTravelStore } from "@/store/travelStore";
import type { GraphModel } from "@/types/graph";
import type { PartDefinition } from "@/types/parts";
import type { ResourceModel } from "@/types/resources";
import type { SimConfig } from "@/types/simConfig";
import type { TravelMatrix } from "@/types/travelTimes";
import type { WorkcenterModel } from "@/types/workcenter";
import { Play, Square, Settings, FolderOpen, Save } from "lucide-react";
import { SimConfigModal } from "./SimConfigModal";

interface SimFilePayload {
  version?: string;
  meta?: { name?: string; modified_at?: string };
  graph: GraphModel;
  resources?: ResourceModel[];
  parts?: PartDefinition[];
  workcenters?: WorkcenterModel[];
  sim_config?: Partial<SimConfig>;
  travel_times?: TravelMatrix;
}

const MODEL_FILE_EXTENSION = ".mfgsim";

function sanitizeProjectName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "_") || "simulation";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasGraphPayload(payload: unknown): payload is SimFilePayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<SimFilePayload>;
  const graph = candidate.graph;
  return Boolean(
    graph &&
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges) &&
    (candidate.resources === undefined || Array.isArray(candidate.resources)) &&
    (candidate.parts === undefined || Array.isArray(candidate.parts)) &&
    (candidate.workcenters === undefined || Array.isArray(candidate.workcenters)) &&
    (candidate.sim_config === undefined || isRecord(candidate.sim_config)) &&
    (candidate.travel_times === undefined || isRecord(candidate.travel_times))
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function SimControls() {
  const { runSimulation, stopSimulation, validateGraph } = useSimApi();
  const simState = useSimStore((s) => s.simState);
  const projectName = useSimStore((s) => s.projectName);
  const setProjectName = useSimStore((s) => s.setProjectName);
  const [showConfig, setShowConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { loadGraph, exportGraph } = useGraphStore();
  const { resources, setResources } = useResourceStore();
  const { setParts } = usePartStore();
  const { setWorkcenters } = useWorkcenterStore();
  const simConfig = useSimStore((s) => s.simConfig);

  const isRunning = simState === "running" || simState === "warmup";

  async function handleRun() {
    setError(null);
    try {
      const validation = await validateGraph();
      if (!validation.valid) {
        setError(validation.errors.map((e) => e.message).join(" | "));
        return;
      }
      await runSimulation();
    } catch (error) {
      setError(getErrorMessage(error, "Failed to start the simulation."));
    }
  }

  async function handleSave() {
    const payload = {
      version: "1.0",
      meta: { name: projectName, modified_at: new Date().toISOString() },
      graph: exportGraph(),
      resources,
      parts: usePartStore.getState().parts,
      workcenters: useWorkcenterStore.getState().workcenters,
      sim_config: simConfig,
      travel_times: useTravelStore.getState().matrix,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeProjectName(projectName)}${MODEL_FILE_EXTENSION}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoad() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = MODEL_FILE_EXTENSION;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (!file.name.toLowerCase().endsWith(MODEL_FILE_EXTENSION)) {
          throw new Error(`Unsupported file type. Select a ${MODEL_FILE_EXTENSION} model file.`);
        }
        const text = await file.text();
        const payload = JSON.parse(text) as unknown;
        if (!hasGraphPayload(payload)) {
          throw new Error("Invalid model file: missing graph data.");
        }
        loadGraph(payload.graph);
        if (payload.resources) setResources(payload.resources);
        if (payload.parts) setParts(payload.parts);
        if (payload.workcenters) setWorkcenters(payload.workcenters);
        if (payload.sim_config) useSimStore.getState().setSimConfig(payload.sim_config);
        if (payload.travel_times) useTravelStore.getState().setMatrix(payload.travel_times);
        if (payload.meta?.name) setProjectName(payload.meta.name);
        setError(null);
      } catch (error) {
        setError(getErrorMessage(error, "Failed to load the selected model file."));
      }
    };
    input.click();
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shadow-sm">
        <span className="font-bold text-blue-700 text-sm tracking-tight shrink-0">MfgSim</span>

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="text-sm font-medium text-gray-700 bg-transparent border-b border-transparent
                     hover:border-gray-300 focus:border-blue-400 focus:outline-none
                     px-0.5 py-0.5 w-56 transition-colors"
          placeholder="Project name…"
          title="Click to rename project"
        />

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        <button onClick={handleSave} title={`Save (${MODEL_FILE_EXTENSION})`} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
          <Save size={16} />
        </button>
        <button
          onClick={handleLoad}
          title={`Open (${MODEL_FILE_EXTENSION})`}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        >
          <FolderOpen size={16} />
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        <button onClick={() => setShowConfig(true)} title="Sim Settings" className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
          <Settings size={16} />
        </button>

        {!isRunning ? (
          <button
            onClick={handleRun}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700"
          >
            <Play size={14} /> Run
          </button>
        ) : (
          <button
            onClick={stopSimulation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700"
          >
            <Square size={14} /> Stop
          </button>
        )}

        {error && (
          <span className="text-xs text-red-600 ml-2 max-w-xs truncate" title={error}>
            ⚠ {error}
          </span>
        )}
      </div>

      {showConfig && <SimConfigModal onClose={() => setShowConfig(false)} />}
    </>
  );
}
