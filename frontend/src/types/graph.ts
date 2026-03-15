export type DistributionType =
  | "fixed"
  | "normal"
  | "exponential"
  | "triangular"
  | "uniform"
  | "weibull"
  | "lognormal"
  | "poisson";

export interface DistributionConfig {
  type: DistributionType;
  value?: number;   // fixed
  mean?: number;    // normal, lognormal, poisson
  std?: number;     // normal, lognormal
  low?: number;     // triangular, uniform
  high?: number;    // triangular, uniform
  mode?: number;    // triangular
  scale?: number;   // exponential, weibull
  shape?: number;   // weibull
}

export interface SourceNodeData extends Record<string, unknown> {
  label: string;
  inter_arrival: DistributionConfig;
  entity_type: string;
  max_entities?: number;
  batch_size?: number;
  output_part?: string;
}

export interface ProcessNodeData extends Record<string, unknown> {
  label: string;
  duration: DistributionConfig;
  capacity: number;
  resource_id?: string;
  resource_performs_process: boolean;
  batch_size?: number;
  min_batch_size?: number;
  priority?: "low" | "medium" | "high" | "bottleneck";
  max_infeed?: number;
  max_outfeed?: number;
  fallout_rate?: number;
  input_parts?: string[];
  output_part?: string;
  workcenter_id?: string;
}

export interface SinkNodeData extends Record<string, unknown> {
  label: string;
}

export interface StorageNodeData extends Record<string, unknown> {
  label: string;
  max_capacity?: number;
}

export type NodeData = SourceNodeData | ProcessNodeData | SinkNodeData | StorageNodeData;

export interface SimNode {
  id: string;
  type: "source" | "process" | "sink" | "storage";
  position: { x: number; y: number };
  data: NodeData;
}

export interface SimEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string;
  target_handle?: string;
  resource_id?: string;
  transport_batch_size?: number;
}

export interface GraphModel {
  nodes: SimNode[];
  edges: SimEdge[];
}
