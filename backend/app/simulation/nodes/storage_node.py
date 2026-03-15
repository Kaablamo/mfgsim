from __future__ import annotations
import simpy
from app.simulation.nodes.base_node import BaseSimNode
from app.simulation.collector import StatsCollector


class StorageNode(BaseSimNode):
    """
    A named inventory buffer that entities pass through instantly.

    Primary purposes:
    - Acts as a routing waypoint so parts accumulate near high-priority
      (e.g. bottleneck) stations.
    - Provides a distinct node in the graph so the routing matrix can
      assign short travel times from storage to an adjacent station
      (e.g. operator travels 2 units from local storage vs 10 units
      from a remote station).
    - Optional max_capacity limits how much WIP the routing algorithm
      will direct here before preferring other paths (soft back-pressure).

    Priority is inferred dynamically from downstream topology:
    - Storage priority = (max downstream priority) - 1 while the
      downstream node's queue is below its min_batch_size (urgent to feed).
    - Storage priority drops to -1 (below "low") once the downstream node
      has enough parts to start — don't waste capacity over-filling it.

    Entities yield a zero-time timeout so that queue_length is briefly
    observable at the same simulation tick — this allows the routing
    score to detect a filling or full storage and divert accordingly.
    """

    def __init__(
        self,
        node_id: str,
        label: str,
        env: simpy.Environment,
        collector: StatsCollector,
        max_capacity: int | None = None,
    ) -> None:
        super().__init__(node_id, label, env, collector)
        self.max_capacity = max_capacity

        # routing_priority is intentionally left at the base default (1 / medium)
        # because effective_routing_priority() overrides it dynamically at runtime.
        self.node_min_batch_size = 1
        self.node_max_capacity = max_capacity  # checked by base routing score

        collector.register_node(
            node_id, label,
            capacity=max_capacity if max_capacity is not None else 9999,
            node_type="storage",
        )

    def effective_routing_priority(self) -> int:
        """
        Infer routing priority from the live state of downstream connections.

        For each downstream node, compare its current queue_length to its
        node_min_batch_size:

        - If ANY downstream is underfed (queue < min_batch_size):
              priority = max(underfed downstream priorities) - 1
              ("just below" the most urgent downstream station)

        - If ALL downstream nodes are adequately fed:
              priority = -1  (below "low" — don't waste resources over-filling)

        This handles both infeed and outfeed storage roles automatically:

        Infeed (storage before a process):
            While the downstream process is starved, storage is nearly as
            urgent as the process itself.  Once the process has enough parts
            to start its next batch, storage fades into the background.

        Outfeed (storage after a bottleneck):
            Storage looks at the NEXT process (its downstream).  When that
            next process has space, storage priority = -1 so the bottleneck
            routes directly there.  When the next process is full (state=-1
            in the routing score), the state dimension already forces routing
            to storage regardless of priority.
        """
        if not self.downstream:
            return 1  # medium fallback — no downstream yet

        best_urgent_priority: int = -1

        for conn in self.downstream:
            ds_acc = self.collector.nodes.get(conn.target.node_id)
            ds_queue = ds_acc.queue_length if ds_acc else 0
            # Include in-transit parts so storage doesn't over-commit to a
            # destination that already has enough parts on the way.
            ds_effective_queue = ds_queue + conn.target._pending_arrivals
            ds_min_batch = conn.target.node_min_batch_size
            ds_priority = conn.target.routing_priority  # static config on process/sink

            if ds_effective_queue < ds_min_batch:
                # This downstream is starved — storage should help feed it
                if ds_priority > best_urgent_priority:
                    best_urgent_priority = ds_priority

        if best_urgent_priority >= 0:
            # Priority "just below" the most urgent underfed downstream
            # (bottleneck=3 → storage=2=high; high=2 → storage=1=medium; etc.)
            return max(-1, best_urgent_priority - 1)

        # All downstream nodes are adequately fed — storage is low urgency
        return -1

    def submit(self, entity_id: int, arrived_at: float) -> None:
        acc = self.collector.nodes[self.node_id]
        acc.queue_length += 1
        self.env.process(self._pass_through(entity_id, arrived_at))

    def _pass_through(self, entity_id: int, arrived_at: float):
        """
        Yield a zero-time event so queue_length is briefly observable at
        this simulation tick, then route downstream.

        The queue slot stays occupied until a downstream connection opens.
        This keeps back-pressure visible to upstream routing: if all
        downstream nodes are hard-blocked (workcenter full, infeed cap, etc.)
        the StorageNode's queue_length remains elevated, which prevents
        upstream nodes from routing more parts here than the downstream
        can absorb.
        """
        acc = self.collector.nodes[self.node_id]
        yield self.env.timeout(0)
        # Hold queue slot until routing succeeds — back-pressure stays visible upstream.
        # Yield on downstream _capacity_events rather than timeout(0) so the simulation
        # clock can advance to the next real event instead of spinning at the same step.
        conn = self._choose_downstream(entity_id)
        while conn is None:
            if not any(not c.is_fallout for c in self.downstream):
                # No non-fallout connections at all — drop entity and free slot.
                acc.queue_length -= 1
                acc.record_completion(self.env.now - arrived_at, 0.0)
                return
            # Include shared workcenter events so storage wakes up when a downstream
            # workcenter slot frees, even if the target node's own queue depth didn't change.
            events = self._downstream_capacity_events()
            yield self.env.any_of(events)
            conn = self._choose_downstream(entity_id)
        acc.queue_length -= 1
        acc.record_completion(self.env.now - arrived_at, 0.0)
        self._dispatch_to_conn(entity_id, arrived_at, conn)
        self._notify_capacity_change()  # queue slot freed — wake upstream deferred routers
