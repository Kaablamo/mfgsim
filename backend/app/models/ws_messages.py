from __future__ import annotations
from typing import Any, Dict, List, Literal
from pydantic import BaseModel


class NodeStats(BaseModel):
    node_id: str
    label: str
    node_type: str = "process"   # "source" | "process" | "sink"
    queue_length: int = 0
    in_process: int = 0
    utilization: float = 0.0
    throughput: float = 0.0
    avg_cycle_time: float = 0.0
    total_completed: int = 0


class ResourceStats(BaseModel):
    resource_id: str
    name: str
    utilization: float = 0.0
    requests_queued: int = 0


class TickPayload(BaseModel):
    msg_type: Literal["tick"] = "tick"
    sim_time: float
    nodes: List[NodeStats]
    resources: List[ResourceStats]
    total_wip: int


class SummaryPayload(BaseModel):
    msg_type: Literal["summary"] = "summary"
    total_sim_time: float
    nodes: List[NodeStats]
    resources: List[ResourceStats]
    total_throughput: int
    sim_run_seconds: float


class StatusPayload(BaseModel):
    msg_type: Literal["status"] = "status"
    state: Literal["running", "paused", "stopped", "warmup", "idle"]


class ErrorPayload(BaseModel):
    msg_type: Literal["error"] = "error"
    code: str
    message: str


class EventLogPayload(BaseModel):
    msg_type: Literal["event_log"] = "event_log"
    events: List[Dict[str, Any]]   # serialized SimEvent dicts (via dataclasses.asdict)
    truncated: bool = False
