import { create } from "zustand";
import type { TravelMatrix, ResourceTravelTimes } from "@/types/travelTimes";

interface TravelStore {
  matrix: TravelMatrix;
  setTime: (resourceId: string, fromId: string, toId: string, time: number) => void;
  clearResource: (resourceId: string) => void;
  setMatrix: (m: TravelMatrix) => void;
  exportForApi: () => ResourceTravelTimes[];
}

export const useTravelStore = create<TravelStore>((set, get) => ({
  matrix: {},

  setTime: (resourceId, fromId, toId, time) =>
    set((s) => ({
      matrix: {
        ...s.matrix,
        [resourceId]: {
          ...s.matrix[resourceId],
          [fromId]: {
            ...(s.matrix[resourceId]?.[fromId] ?? {}),
            [toId]: time,
          },
        },
      },
    })),

  clearResource: (resourceId) =>
    set((s) => {
      const { [resourceId]: _, ...rest } = s.matrix;
      return { matrix: rest };
    }),

  setMatrix: (matrix) => set({ matrix }),

  exportForApi: () => {
    const { matrix } = get();
    return Object.entries(matrix)
      .map(([resourceId, fromMap]) => ({
        resource_id: resourceId,
        entries: Object.entries(fromMap).flatMap(([fromId, toMap]) =>
          Object.entries(toMap)
            .filter(([, time]) => time > 0)
            .map(([toId, time]) => ({
              from_node_id: fromId,
              to_node_id: toId,
              time,
            }))
        ),
      }))
      .filter((rtt) => rtt.entries.length > 0);
  },
}));
