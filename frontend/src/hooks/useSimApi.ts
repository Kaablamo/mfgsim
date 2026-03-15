import { apiClient } from "@/api/client";
import { useGraphStore } from "@/store/graphStore";
import { useSimStore } from "@/store/simStore";
import { useResourceStore } from "@/store/resourceStore";
import { useTravelStore } from "@/store/travelStore";
import { useWorkcenterStore } from "@/store/workcenterStore";

export function useSimApi() {
  const exportGraph = useGraphStore((s) => s.exportGraph);
  const { simConfig, setRunId, reset } = useSimStore();
  const resources = useResourceStore((s) => s.resources);

  async function runSimulation() {
    reset();
    const graph = exportGraph();
    const travel_times = useTravelStore.getState().exportForApi();
    const workcenters = useWorkcenterStore.getState().workcenters;
    const res = await apiClient.post<{ run_id: string; status: string }>("/api/sim/run", {
      graph,
      resources,
      workcenters,
      sim_config: simConfig,
      travel_times,
    });
    setRunId(res.data.run_id);
    return res.data;
  }

  async function stopSimulation() {
    const runId = useSimStore.getState().currentRunId;
    if (!runId) return;
    await apiClient.post("/api/sim/stop", { run_id: runId });
  }

  async function validateGraph() {
    const graph = exportGraph();
    const res = await apiClient.post<{
      valid: boolean;
      errors: { node_id: string; message: string }[];
    }>("/api/graph/validate", graph);
    return res.data;
  }

  async function shutdownServer() {
    const res = await apiClient.post<{ status: string }>("/api/system/shutdown");
    return res.data;
  }

  return { runSimulation, stopSimulation, validateGraph, shutdownServer };
}
