export interface NodeStats {
  node_id: string;
  label: string;
  node_type: string;   // "source" | "process" | "sink"
  queue_length: number;
  in_process: number;
  utilization: number;
  throughput: number;
  avg_cycle_time: number;
  total_completed: number;
}

export interface ResourceStats {
  resource_id: string;
  name: string;
  utilization: number;
  requests_queued: number;
}

export interface TickPayload {
  msg_type: "tick";
  sim_time: number;
  nodes: NodeStats[];
  resources: ResourceStats[];
  total_wip: number;
}

export interface SummaryPayload {
  msg_type: "summary";
  total_sim_time: number;
  nodes: NodeStats[];
  resources: ResourceStats[];
  total_throughput: number;
  sim_run_seconds: number;
}

export interface StatusPayload {
  msg_type: "status";
  state: "running" | "paused" | "stopped" | "warmup" | "idle";
}

export interface ErrorPayload {
  msg_type: "error";
  code: string;
  message: string;
}

export interface SimEvent {
  time: number;
  event_type: string;
  entity_id: number | null;
  node_id: string | null;
  node_label: string | null;
  resource_id: string | null;
  resource_label: string | null;
  resource_instance: number | null;
  details: string | null;
}

export interface EventLogPayload {
  msg_type: "event_log";
  events: SimEvent[];
  truncated: boolean;
}

export type WsMessage = TickPayload | SummaryPayload | StatusPayload | ErrorPayload | EventLogPayload;
