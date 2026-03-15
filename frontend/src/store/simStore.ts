import { create } from "zustand";
import type { NodeStats, ResourceStats, SummaryPayload, SimEvent, EventLogPayload } from "@/types/wsMessages";
import type { SimConfig } from "@/types/simConfig";
import { defaultSimConfig } from "@/types/simConfig";

export type SimState = "idle" | "warmup" | "running" | "stopped";

interface HistoryPoint {
  sim_time: number;
  total_wip: number;
  nodes: NodeStats[];
  resources: ResourceStats[];
}

interface SimStore {
  projectName: string;
  simState: SimState;
  simConfig: SimConfig;
  currentRunId: string | null;
  shutdownRequested: boolean;
  simTime: number;

  // Live data
  liveNodes: NodeStats[];
  liveResources: ResourceStats[];
  liveWip: number;
  history: HistoryPoint[];

  // Final summary
  summary: SummaryPayload | null;

  // Event log (populated when simulation ends)
  events: SimEvent[];
  eventsTruncated: boolean;

  // Actions
  setProjectName: (name: string) => void;
  setSimState: (s: SimState) => void;
  setSimConfig: (cfg: Partial<SimConfig>) => void;
  setRunId: (id: string | null) => void;
  setShutdownRequested: (value: boolean) => void;
  applyTick: (sim_time: number, nodes: NodeStats[], resources: ResourceStats[], total_wip: number) => void;
  applySummary: (summary: SummaryPayload) => void;
  applyEventLog: (payload: EventLogPayload) => void;
  reset: () => void;
}

export const useSimStore = create<SimStore>((set) => ({
  projectName: "Untitled Simulation",
  simState: "idle",
  simConfig: defaultSimConfig,
  currentRunId: null,
  shutdownRequested: false,
  simTime: 0,
  liveNodes: [],
  liveResources: [],
  liveWip: 0,
  history: [],
  summary: null,
  events: [],
  eventsTruncated: false,

  setProjectName: (projectName) => set({ projectName }),
  setSimState: (simState) => set({ simState }),
  setSimConfig: (cfg) => set((s) => ({ simConfig: { ...s.simConfig, ...cfg } })),
  setRunId: (id) => set({ currentRunId: id }),
  setShutdownRequested: (shutdownRequested) => set({ shutdownRequested }),

  applyTick: (sim_time, nodes, resources, total_wip) =>
    set((s) => {
      // If sim_time goes backward while history is non-empty, this tick is from
      // a stale engine that was stopped but still had queued broadcasts. Treat
      // it as the start of a fresh run rather than splicing old data in.
      const stale = sim_time < s.simTime && s.history.length > 0;
      return {
        simTime: sim_time,
        liveNodes: nodes,
        liveResources: resources,
        liveWip: total_wip,
        history: [
          ...(stale ? [] : s.history.slice(-4999)),
          { sim_time, total_wip, nodes, resources },
        ],
      };
    }),

  applySummary: (summary) => set({ summary }),

  applyEventLog: (payload) => set({ events: payload.events, eventsTruncated: payload.truncated }),

  reset: () =>
    set({
      simState: "idle",
      simTime: 0,
      liveNodes: [],
      liveResources: [],
      liveWip: 0,
      history: [],
      summary: null,
      events: [],
      eventsTruncated: false,
      currentRunId: null,
      shutdownRequested: false,
    }),
}));
