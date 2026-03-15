"""
StatsCollector — accumulates per-node and per-resource statistics.
Designed to be reset at the end of the warm-up period without
disturbing the SimPy environment itself.
"""
from __future__ import annotations
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from app.models.ws_messages import NodeStats, ResourceStats
from app.simulation.event_log import EventLogger


@dataclass
class NodeAccumulator:
    node_id: str
    label: str
    node_type: str = "process"   # "source" | "process" | "sink"
    # Running counters (reset on warm-up end)
    completed: int = 0
    total_cycle_time: float = 0.0
    utilization_busy_time: float = 0.0
    # Live state (not reset — reflects current sim reality)
    queue_length: int = 0
    in_process: int = 0
    # Capacity (set once from node config)
    capacity: int = 1
    # When stats window started (set to env.now at reset)
    stats_start_time: float = 0.0

    def record_completion(self, cycle_time: float, busy_increment: float) -> None:
        self.completed += 1
        self.total_cycle_time += cycle_time
        self.utilization_busy_time += busy_increment

    def to_stats(self, elapsed: float) -> NodeStats:
        avg_ct = self.total_cycle_time / self.completed if self.completed > 0 else 0.0
        # Utilization: fraction of server-time actually processing
        server_time = elapsed * self.capacity
        util = min(1.0, self.utilization_busy_time / server_time) if server_time > 0 else 0.0
        tput = self.completed / elapsed if elapsed > 0 else 0.0
        return NodeStats(
            node_id=self.node_id,
            label=self.label,
            node_type=self.node_type,
            queue_length=self.queue_length,
            in_process=self.in_process,
            utilization=round(util, 4),
            throughput=round(tput, 4),
            avg_cycle_time=round(avg_ct, 4),
            total_completed=self.completed,
        )


@dataclass
class ResourceAccumulator:
    resource_id: str
    name: str
    quantity: int = 1
    # Accumulated busy time from *completed* holds
    busy_time: float = 0.0
    # Timestamps of currently-active holds (one entry per concurrent unit in use).
    # Enables real-time utilization without waiting for entity completion.
    _acquire_times: List[float] = field(default_factory=list)
    requests_queued: int = 0
    stats_start_time: float = 0.0
    # Per-instance location tracking: maps instance_id → last node_id worked at.
    # None means the instance has not yet been used (no travel penalty on first dispatch).
    # Not reset on warmup end — operators keep their positions across the warmup boundary.
    last_node_ids: Dict[int, Optional[str]] = field(default_factory=dict)
    # Pool of free instance IDs (1-based).  Populated in __post_init__.
    _free_instances: deque = field(default_factory=deque)

    def __post_init__(self) -> None:
        self._free_instances = deque(range(1, self.quantity + 1))
        self.last_node_ids = {i: None for i in range(1, self.quantity + 1)}

    def on_acquire(self, now: float) -> int:
        """Record that a resource unit was just acquired. Returns the instance ID (1-based)."""
        self._acquire_times.append(now)
        return self._free_instances.popleft() if self._free_instances else 1

    def on_release(self, now: float, instance_id: int) -> None:
        """Record that a resource unit was just released; commit elapsed to busy_time."""
        if self._acquire_times:
            start = self._acquire_times.pop(0)   # FIFO — earliest acquire first
            self.busy_time += now - start
        # Return instance to pool (guard: don't overflow beyond capacity, handles warmup-era releases)
        if len(self._free_instances) < self.quantity:
            self._free_instances.append(instance_id)

    def log_instance(self, instance_id: Optional[int]) -> Optional[int]:
        """Return the instance suffix to expose in the event log, if any."""
        if instance_id is None or self.quantity <= 1:
            return None
        return instance_id

    def display_name(self, instance_id: Optional[int] = None) -> str:
        """Return the human-facing resource name for log details."""
        log_instance = self.log_instance(instance_id)
        if log_instance is None:
            return self.name
        return f"{self.name} {log_instance}"

    def to_stats(self, elapsed: float, now: float) -> ResourceStats:
        # Add time currently being held by in-progress operations
        in_progress_time = sum(now - t for t in self._acquire_times)
        total_busy = self.busy_time + in_progress_time
        server_time = elapsed * self.quantity
        util = min(1.0, total_busy / server_time) if server_time > 0 else 0.0
        return ResourceStats(
            resource_id=self.resource_id,
            name=self.name,
            utilization=round(util, 4),
            requests_queued=self.requests_queued,
        )


class StatsCollector:
    def __init__(self) -> None:
        self.nodes: Dict[str, NodeAccumulator] = {}
        self.resources: Dict[str, ResourceAccumulator] = {}
        self._stats_start: float = 0.0
        self.in_transit: int = 0  # entities currently being transported between nodes
        self.logger: EventLogger = EventLogger()

    def register_node(self, node_id: str, label: str, capacity: int = 1, node_type: str = "process") -> None:
        self.nodes[node_id] = NodeAccumulator(node_id=node_id, label=label, node_type=node_type, capacity=capacity)

    def register_resource(self, resource_id: str, name: str, quantity: int = 1) -> None:
        self.resources[resource_id] = ResourceAccumulator(
            resource_id=resource_id, name=name, quantity=quantity
        )

    def reset_stats(self, now: float) -> None:
        """Called at end of warm-up. Resets counters, not live state."""
        self._stats_start = now
        self.logger.reset()
        for acc in self.nodes.values():
            acc.completed = 0
            acc.total_cycle_time = 0.0
            acc.utilization_busy_time = 0.0
            acc.stats_start_time = now
        for acc in self.resources.values():
            acc.busy_time = 0.0
            acc.stats_start_time = now
            # Any units still held during warm-up: restart their clock from now
            # so only post-warmup time counts toward utilization.
            acc._acquire_times = [now] * len(acc._acquire_times)
            # Rebuild instance pool: currently held units get IDs 1..held, free get held+1..quantity
            held = len(acc._acquire_times)
            acc._free_instances = deque(range(held + 1, acc.quantity + 1))

    def snapshot(self, now: float) -> tuple[list[NodeStats], list[ResourceStats], int]:
        elapsed = max(now - self._stats_start, 1e-9)
        node_stats = [acc.to_stats(elapsed) for acc in self.nodes.values()]
        res_stats = [acc.to_stats(elapsed, now) for acc in self.resources.values()]
        total_wip = sum(acc.queue_length + acc.in_process for acc in self.nodes.values()) + self.in_transit
        return node_stats, res_stats, total_wip
