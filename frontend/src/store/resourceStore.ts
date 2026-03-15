import { create } from "zustand";
import type { ResourceModel } from "@/types/resources";

interface ResourceStore {
  resources: ResourceModel[];
  addResource: (r: ResourceModel) => void;
  updateResource: (id: string, patch: Partial<ResourceModel>) => void;
  deleteResource: (id: string) => void;
  setResources: (r: ResourceModel[]) => void;
}

export const useResourceStore = create<ResourceStore>((set) => ({
  resources: [],

  addResource: (r) => set((s) => ({ resources: [...s.resources, r] })),

  updateResource: (id, patch) =>
    set((s) => ({
      resources: s.resources.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),

  deleteResource: (id) =>
    set((s) => ({ resources: s.resources.filter((r) => r.id !== id) })),

  setResources: (resources) => set({ resources }),
}));
