from __future__ import annotations
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DistributionType(str, Enum):
    fixed = "fixed"
    normal = "normal"
    exponential = "exponential"
    triangular = "triangular"
    uniform = "uniform"
    weibull = "weibull"
    lognormal = "lognormal"
    poisson = "poisson"


class DistributionConfig(BaseModel):
    type: DistributionType = DistributionType.fixed
    # fixed
    value: Optional[float] = None
    # normal / lognormal / poisson
    mean: Optional[float] = None
    std: Optional[float] = None
    # triangular / uniform
    low: Optional[float] = None
    high: Optional[float] = None
    mode: Optional[float] = None  # triangular only
    # exponential / weibull
    scale: Optional[float] = None
    shape: Optional[float] = None  # weibull only


class NodePosition(BaseModel):
    x: float = 0.0
    y: float = 0.0


class SourceNodeData(BaseModel):
    label: str = "Source"
    inter_arrival: DistributionConfig = Field(
        default_factory=lambda: DistributionConfig(type=DistributionType.fixed, value=1.0)
    )
    entity_type: str = "Entity"
    max_entities: Optional[int] = None  # None = unlimited
    batch_size: int = 1                 # entities released per inter-arrival interval
    output_part: Optional[str] = None   # part ID (metadata only; not used by simulation)


class ProcessNodeData(BaseModel):
    label: str = "Process"
    duration: DistributionConfig = Field(
        default_factory=lambda: DistributionConfig(type=DistributionType.fixed, value=1.0)
    )
    capacity: int = 1
    resource_id: Optional[str] = None          # resource assigned to this station
    resource_performs_process: bool = True     # True = resource busy for move+process
                                               # False = resource released after move (automated machine)
    batch_size: int = 1                        # max entities per batch cycle (1 = single-piece flow)
    min_batch_size: int = 1                    # minimum queue depth before batch starts
    priority: str = "medium"                   # routing priority: "low" | "medium" | "high" | "bottleneck"
    max_infeed: Optional[int] = None           # max parts waiting in infeed queue (None = unlimited)
    max_outfeed: Optional[int] = None          # max parts in outfeed buffer; station blocks when full (None = unlimited)
    fallout_rate: float = 0.0                  # fraction of parts that fail and reroute via the fallout handle (0–1)
    input_parts: List[str] = Field(default_factory=list)   # part IDs (metadata only; not used by simulation)
    output_part: Optional[str] = None                      # part ID (metadata only; not used by simulation)
    workcenter_id: Optional[str] = None                    # workcenter this node belongs to


class SinkNodeData(BaseModel):
    label: str = "Sink"


class StorageNodeData(BaseModel):
    label: str = "Storage"
    max_capacity: Optional[int] = None   # None = unlimited
    # priority is intentionally absent: StorageNode infers it dynamically
    # from downstream topology at runtime.


class NodeType(str, Enum):
    source = "source"
    process = "process"
    sink = "sink"
    storage = "storage"


class NodeModel(BaseModel):
    id: str
    type: NodeType
    position: NodePosition = Field(default_factory=NodePosition)
    data: Dict[str, Any] = Field(default_factory=dict)


class EdgeModel(BaseModel):
    id: str
    source: str
    target: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None
    resource_id: Optional[str] = None          # transport resource assigned to this edge
    transport_batch_size: int = 1              # parts carried per transport trip (requires resource_id)


class GraphModel(BaseModel):
    nodes: List[NodeModel] = Field(default_factory=list)
    edges: List[EdgeModel] = Field(default_factory=list)
