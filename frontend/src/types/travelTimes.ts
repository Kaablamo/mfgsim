export interface TravelEntry {
  from_node_id: string;
  to_node_id: string;
  time: number;
}

export interface ResourceTravelTimes {
  resource_id: string;
  entries: TravelEntry[];
}

/** Nested dict used in the Zustand store: resource_id → from_node_id → to_node_id → time */
export type TravelMatrix = Record<string, Record<string, Record<string, number>>>;
