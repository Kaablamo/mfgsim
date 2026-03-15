import { create } from "zustand";
import type { PartDefinition } from "@/types/parts";

interface PartStore {
  parts: PartDefinition[];
  addPart: (p: PartDefinition) => void;
  updatePart: (id: string, patch: Partial<PartDefinition>) => void;
  deletePart: (id: string) => void;
  setParts: (parts: PartDefinition[]) => void;
}

export const usePartStore = create<PartStore>((set) => ({
  parts: [],

  addPart: (p) => set((s) => ({ parts: [...s.parts, p] })),

  updatePart: (id, patch) =>
    set((s) => ({
      parts: s.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  deletePart: (id) =>
    set((s) => ({ parts: s.parts.filter((p) => p.id !== id) })),

  setParts: (parts) => set({ parts }),
}));
