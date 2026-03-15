from __future__ import annotations
import simpy
import numpy as np
from app.simulation.nodes.base_node import BaseSimNode
from app.simulation.collector import StatsCollector
from app.simulation import distributions
from app.models.graph_models import DistributionConfig


class SourceNode(BaseSimNode):
    def __init__(
        self,
        node_id: str,
        label: str,
        env: simpy.Environment,
        collector: StatsCollector,
        inter_arrival: DistributionConfig,
        rng: np.random.Generator,
        max_entities: int | None = None,
        warmup_mode: bool = False,
        batch_size: int = 1,
    ) -> None:
        super().__init__(node_id, label, env, collector)
        self.inter_arrival = inter_arrival
        self.rng = rng
        self.max_entities = max_entities
        self.warmup_mode = warmup_mode
        self.batch_size = max(1, batch_size)
        self._entity_counter = 0
        self._active = True

    def start(self) -> None:
        self.env.process(self._generate())

    def stop(self) -> None:
        self._active = False

    def submit(self, entity_id: int, arrived_at: float) -> None:
        # Sources don't receive entities
        pass

    def _generate(self):
        while self._active:
            # Emit one full batch at the current time step
            for _ in range(self.batch_size):
                if self.max_entities is not None and self._entity_counter >= self.max_entities:
                    return
                self._entity_counter += 1
                self.collector.nodes[self.node_id].record_completion(0.0, 0.0)
                self.collector.logger.log(
                    time=self.env.now, event_type="PART_CREATED",
                    entity_id=self._entity_counter,
                    node_id=self.node_id, node_label=self.label,
                    details=f"Part {self._entity_counter} created at {self.label}",
                )
                self._route_downstream(self._entity_counter, self.env.now)

            if self.warmup_mode:
                yield self.env.timeout(0)  # Flood immediately on warm-up
            else:
                iat = distributions.sample(self.inter_arrival, self.rng)
                yield self.env.timeout(max(0.0, iat))
