from __future__ import annotations
import simpy
from app.simulation.nodes.base_node import BaseSimNode
from app.simulation.collector import StatsCollector


class SinkNode(BaseSimNode):
    def __init__(
        self,
        node_id: str,
        label: str,
        env: simpy.Environment,
        collector: StatsCollector,
    ) -> None:
        super().__init__(node_id, label, env, collector)
        self.total_received = 0
        # Register sink in collector so it appears in stats
        collector.register_node(node_id, label, capacity=1, node_type="sink")

    def submit(self, entity_id: int, arrived_at: float) -> None:
        self.total_received += 1
        acc = self.collector.nodes[self.node_id]
        cycle_time = self.env.now - arrived_at
        acc.record_completion(cycle_time, 0.0)
        self.collector.logger.log(
            time=self.env.now, event_type="PART_COMPLETED",
            entity_id=entity_id, node_id=self.node_id, node_label=self.label,
            details=f"Part {entity_id} completed at {self.label} (cycle time: {cycle_time:.2f})",
        )

    def _choose_downstream(self):
        return None  # Sinks have no downstream
