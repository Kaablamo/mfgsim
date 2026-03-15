import { create } from "zustand";
import type { WorkcenterModel } from "@/types/workcenter";

interface WorkcenterStore {
  workcenters: WorkcenterModel[];
  addWorkcenter: (w: WorkcenterModel) => void;
  updateWorkcenter: (id: string, patch: Partial<WorkcenterModel>) => void;
  deleteWorkcenter: (id: string) => void;
  setWorkcenters: (w: WorkcenterModel[]) => void;
}

export const useWorkcenterStore = create<WorkcenterStore>((set) => ({
  workcenters: [],

  addWorkcenter: (w) => set((s) => ({ workcenters: [...s.workcenters, w] })),

  updateWorkcenter: (id, patch) =>
    set((s) => ({
      workcenters: s.workcenters.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    })),

  deleteWorkcenter: (id) =>
    set((s) => ({ workcenters: s.workcenters.filter((w) => w.id !== id) })),

  setWorkcenters: (workcenters) => set({ workcenters }),
}));
