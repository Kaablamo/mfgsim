from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, List, Tuple

import simpy

if TYPE_CHECKING:
    from app.simulation.collector import StatsCollector


@dataclass
class DownstreamConnection:
    """Wraps a downstream node with optional transport resource info."""
    target: "BaseSimNode"
    transport_resource: simpy.Resource | None = None
    transport_resource_id: str | None = None
    travel_time: float = 0.0
    transport_batch_size: int = 1              # parts carried per trip; >1 buffers until full
    is_fallout: bool = False                   # True = this connection is the rework/fallout path
    _batch_buffer: List[Tuple[int, float]] = field(default_factory=list)  # (entity_id, arrived_at)
    _dispatch_count: int = 0                   # cumulative entities dispatched; used as tiebreak


class BaseSimNode(ABC):
    def __init__(self, node_id: str, label: str, env: simpy.Environment,
                 collector: "StatsCollector") -> None:
        self.node_id = node_id
        self.label = label
        self.env = env
        self.collector = collector
        # Downstream connections wired up by graph_builder after all nodes are created
        self.downstream: list[DownstreamConnection] = []
        # Routing attributes — overridden by ProcessNode / StorageNode
        self.routing_priority: int = 1    # 0=low 1=medium 2=high 3=bottleneck
        self.node_min_batch_size: int = 1  # mirrors ProcessNode.min_batch_size for routing
        self.node_max_capacity: int | None = None  # None = unlimited; checked for storage soft back-pressure
        self.node_max_infeed: int | None = None    # None = unlimited queue; 0 = no infeed area (no queuing)
        # Parts committed to this node but not yet arrived (operator still walking).
        # Incremented SYNCHRONOUSLY at routing-decision time (in _route_downstream /
        # _route_fallout), decremented just before submit() fires.  This ensures that
        # the very next routing decision in the same SimPy event step sees the correct
        # occupancy, preventing the system from over-filling infeed areas or workcenter
        # slots between the moment a transport is scheduled and the moment it executes.
        self._pending_arrivals: int = 0
        # Event that fires when this node gains capacity (server slot freed, queue slot
        # freed, or workcenter slot released).  Waiting coroutines yield on this event
        # instead of polling with timeout(0), which would freeze the SimPy clock by
        # creating an infinite queue of zero-delay events at the current time step.
        self._capacity_event: simpy.Event = env.event()
        # Per-workcenter shared capacity events.  Keyed by workcenter_id; each entry
        # fires when ANY node in that workcenter releases its slot.  This ensures that
        # upstream waiters watching the ENTRY node's _capacity_event are also woken up
        # when the exit node releases the workcenter (they're different node objects).
        # Populated by graph_builder after all nodes are instantiated.
        self._wc_capacity_events: dict = {}

    @abstractmethod
    def submit(self, entity_id: int, arrived_at: float) -> None:
        """Called by an upstream node to hand off an entity."""
        ...

    def _notify_capacity_change(self) -> None:
        """Signal that this node has gained capacity.

        Replaces _capacity_event with a new untriggered event (so future waiters
        queue on the next change), then triggers the old event to wake up any
        coroutines currently sleeping on it.  Called whenever a server slot,
        queue slot, or workcenter slot is freed.
        """
        old = self._capacity_event
        self._capacity_event = self.env.event()
        if not old.triggered:
            old.succeed()

    def _downstream_capacity_events(self) -> list:
        """Build the event list to wait on for downstream capacity.

        Returns each non-fallout downstream node's _capacity_event PLUS the
        per-workcenter shared event for any workcenter-gated destinations.
        The workcenter event fires whenever ANY node in the chain releases its
        slot — so upstream waiters are woken even when the releasing node is
        not the direct target being watched (e.g. exit node releases, entry
        node's event never fires).
        """
        events = [c.target._capacity_event for c in self.downstream if not c.is_fallout]
        seen_wc: set = set()
        for c in self.downstream:
            if c.is_fallout:
                continue
            wc_id = getattr(c.target, 'workcenter_id', None)
            if wc_id and wc_id not in seen_wc:
                ev = self._wc_capacity_events.get(wc_id)
                if ev is not None:
                    events.append(ev)
                seen_wc.add(wc_id)
        return events

    def effective_routing_priority(self) -> int:
        """Return this node's routing priority for upstream scoring.

        StorageNode overrides this to compute a dynamic value based on the
        live state of its downstream connections instead of a static config.
        """
        return self.routing_priority

    def routing_infeed_limit(self, effective_queue: int, in_process: int) -> int | None:
        """Return the infeed cap that upstream routing should apply right now."""
        return self.node_max_infeed

    def _choose_downstream(self, entity_id: int | None = None) -> DownstreamConnection | None:
        """
        Priority-aware routing.  Each downstream target is scored on three
        dimensions (highest wins):

        1. State (most urgent first):
              2 = idle    — below min_batch_size, not currently running.
                            Feed this station; it needs parts to start.
              1 = filling — batch is running (in_process > 0) but queue is
                            below min_batch_size.  A good secondary target
                            to pipeline the next batch.
              0 = funded  — queue already at or above min_batch_size.
                            Skip until other stations are satisfied.

        2. Priority (static for process nodes; dynamically inferred for storage):
              3 = bottleneck  2 = high  1 = medium  0 = low  -1 = below low
              A higher-priority station in any state beats a lower-priority
              station in the same state.

        3. Fill depth (tie-break):
              Higher queue_length wins — favour the station already closest
              to its min_batch_size threshold so one station completes a
              full batch before the next one begins to fill.

        entity_id: when provided, enables the workcenter occupancy filter —
              destinations whose workcenter is full and not already held by
              this entity are excluded (state = -1).
        """
        # Fallout connections are exclusively used by _route_fallout; exclude them here
        # so a rework edge never accidentally absorbs normal production flow.
        eligible = [c for c in self.downstream if not c.is_fallout]
        if not eligible:
            return None
        # NOTE: no len==1 short-circuit here — capacity/workcenter checks must always run.

        def score(c: DownstreamConnection) -> tuple:
            acc = self.collector.nodes.get(c.target.node_id)
            q  = acc.queue_length if acc else 0
            ip = acc.in_process   if acc else 0
            # Count in-transit parts as if already queued so the routing
            # algorithm treats the destination as "more full" than its live
            # queue_length shows.  This prevents the operator's travel time
            # from causing a batch to be split across two machines.
            eq = q + c.target._pending_arrivals  # effective queue
            p  = c.target.effective_routing_priority()  # dynamic for storage nodes
            mb = c.target.node_min_batch_size    # 1 for single-piece
            mc = c.target.node_max_capacity      # None = unlimited (storage total cap)
            mi = c.target.routing_infeed_limit(eq, ip)  # None = unlimited; 0 = no infeed area

            # Partial batch buffer: a connection already holding some (but not all)
            # parts for a batch must be filled before starting any new batch on a
            # different connection.  Without this, the fill-depth tiebreak (eq) can
            # cause one connection's growing _pending_arrivals to perpetually win,
            # leaving the other connection's buffer permanently half-filled.
            if c.transport_batch_size > 1 and 0 < len(c._batch_buffer) < c.transport_batch_size:
                try:
                    node_num = int(c.target.node_id.rsplit("_", 1)[-1])
                except (ValueError, IndexError):
                    node_num = 0
                return (4, p, len(c._batch_buffer), -node_num)  # state=4 beats idle=2

            # Infeed limit (process nodes): avoid when infeed queue is full.
            # mi=0 ("no infeed area"): also count in-process parts — nothing should
            #   arrive while the machine is occupied.  Without this, a machine with
            #   capacity=1 and max_infeed=0 can still accumulate a queue-of-1 because
            #   the routing sees eq=0 when a part is processing but nothing is waiting.
            # mi>0: only the waiting-area depth matters; pipeline feeding is fine.
            if mi is not None and (eq + ip >= 1 if mi == 0 else eq >= mi):
                state = -1  # infeed full (counting in-transit)
            # Storage total capacity: avoid when total WIP at this node is at cap
            elif mc is not None and (eq + ip) >= mc:
                state = -1  # storage full (counting in-transit)
            elif eq >= mb:
                state = 0   # funded — enough to start, don't over-fill
            elif ip > 0:
                state = 1   # filling — batch running, pipeline next
            else:
                state = 2   # idle — needs parts most urgently

            # Workcenter occupancy filter: if the destination belongs to a workcenter
            # and the entity doesn't already hold that workcenter's slot, exclude
            # destinations where the workcenter is at capacity.
            if state != -1 and entity_id is not None:
                dest_wc_id = getattr(c.target, 'workcenter_id', None)
                if dest_wc_id is not None:
                    dest_wc = getattr(c.target, 'workcenter', None)
                    if dest_wc is not None:
                        entity_holds = False
                        hold = getattr(self, 'workcenter_holds', {}).get(entity_id)
                        if hold is not None and hold[0] == dest_wc_id:
                            entity_holds = True
                        if not entity_holds and (dest_wc.count + c.target._pending_arrivals) >= dest_wc.capacity:
                            state = -1  # workcenter full (or full when in-transit parts arrive)

            # Deterministic tiebreak: when (state, priority, fill-depth) are all equal,
            # prefer the node with the lowest numeric ID.  This prevents Python's
            # arbitrary list-order tiebreak from permanently splitting parts between
            # two parallel destinations (e.g. two "Housing Outfeed" nodes both at eq=2),
            # which causes one to never accumulate enough parts to start its batch.
            # Lower node_id → higher preference → negate for max() comparison.
            try:
                node_num = int(c.target.node_id.rsplit("_", 1)[-1])
            except (ValueError, IndexError):
                node_num = 0

            # Round-robin tiebreak: prefer the connection that has been dispatched to
            # the fewest times so far.  This prevents permanent starvation when two
            # parallel destinations are otherwise identical (equal state, priority,
            # and fill depth) — e.g. two machining centres fed from the same robot.
            # -_dispatch_count: lower count → less negative → wins max().
            return (state, p, eq, -c._dispatch_count, -node_num)

        best = max(eligible, key=score)
        # If even the best connection is hard-blocked (state = -1), return None so
        # the caller can defer routing rather than forcing parts into a full queue.
        if score(best)[0] == -1:
            return None
        return best

    def _dispatch_to_conn(self, entity_id: int, arrived_at: float, conn: DownstreamConnection) -> None:
        """Dispatch entity to an already-chosen connection (handles all transport variants)."""
        conn._dispatch_count += 1  # track for round-robin tiebreak in _choose_downstream
        if conn.transport_resource is None:
            conn.target.submit(entity_id, arrived_at)
        elif conn.transport_batch_size > 1:
            conn.target._pending_arrivals += 1
            conn._batch_buffer.append((entity_id, arrived_at))
            if len(conn._batch_buffer) >= conn.transport_batch_size:
                batch = conn._batch_buffer[:]
                conn._batch_buffer.clear()
                self.env.process(self._transport_batch(batch, conn))
        else:
            conn.target._pending_arrivals += 1
            self.env.process(self._transport(entity_id, arrived_at, conn))

    def _deferred_routing(self, entity_id: int, arrived_at: float):
        """SimPy process: wait for downstream capacity, then route.

        Used when _choose_downstream returns None because all eligible connections
        are hard-blocked (max_infeed, storage cap, or workcenter full).  Yields on
        downstream _capacity_event objects so the simulation clock can advance
        normally — avoids the clock-freezing behaviour of timeout(0) spin-waits.
        """
        while True:
            conn = self._choose_downstream(entity_id)
            if conn is not None:
                self._dispatch_to_conn(entity_id, arrived_at, conn)
                return
            events = self._downstream_capacity_events()
            if not events:
                return  # no non-fallout connections — drop entity
            yield self.env.any_of(events)

    def _route_fallout(self, entity_id: int, arrived_at: float) -> None:
        """Route a failed entity via the designated fallout connection.

        If no fallout edge has been connected, falls back to normal routing so
        the simulation keeps running (the unconnected fallout handle is treated
        as a pass-through).
        """
        conn = next((c for c in self.downstream if c.is_fallout), None)
        if conn is None:
            # No rework edge drawn — treat as a normal pass
            self._route_downstream(entity_id, arrived_at)
            return
        if conn.transport_resource is None:
            conn.target.submit(entity_id, arrived_at)
        elif conn.transport_batch_size > 1:
            conn.target._pending_arrivals += 1
            conn._batch_buffer.append((entity_id, arrived_at))
            if len(conn._batch_buffer) >= conn.transport_batch_size:
                batch = conn._batch_buffer[:]
                conn._batch_buffer.clear()
                self.env.process(self._transport_batch(batch, conn))
        else:
            conn.target._pending_arrivals += 1
            self.env.process(self._transport(entity_id, arrived_at, conn))

    def _route_downstream(self, entity_id: int, arrived_at: float) -> None:
        """Route entity to a downstream node, applying transport resource if configured.

        If all eligible destinations are hard-blocked (state = -1), spawns
        _deferred_routing so the entity waits at the upstream node rather than
        being forced into a full queue.
        """
        conn = self._choose_downstream(entity_id)
        if conn is None:
            # Distinguish "no connections at all" (drop entity) from "connections
            # exist but all blocked" (defer routing).
            if any(not c.is_fallout for c in self.downstream):
                self.env.process(self._deferred_routing(entity_id, arrived_at))
            return
        self._dispatch_to_conn(entity_id, arrived_at, conn)

    def _transport(self, entity_id: int, arrived_at: float, conn: DownstreamConnection):
        """SimPy process: acquire transport resource, travel, then hand off entity."""
        # _pending_arrivals is already incremented by the caller (_route_downstream /
        # _route_fallout) synchronously at routing-decision time.
        res_acc = self.collector.resources.get(conn.transport_resource_id) if conn.transport_resource_id else None
        self.collector.in_transit += 1
        if res_acc:
            res_acc.requests_queued += 1
        with conn.transport_resource.request() as req:  # type: ignore[union-attr]
            yield req
            instance_id = 1
            if res_acc:
                res_acc.requests_queued -= 1
                instance_id = res_acc.on_acquire(self.env.now)
            self.collector.logger.log(
                time=self.env.now, event_type="PART_TRANSPORT_START",
                entity_id=entity_id,
                node_id=conn.target.node_id, node_label=conn.target.label,
                resource_id=conn.transport_resource_id,
                resource_label=res_acc.name if res_acc else None,
                resource_instance=res_acc.log_instance(instance_id) if res_acc else None,
                details=(
                    f"Part {entity_id} transport: {self.label} → {conn.target.label}"
                    + (f" by {res_acc.display_name(instance_id)}" if res_acc else "")
                ),
            )
            if conn.travel_time > 0:
                yield self.env.timeout(conn.travel_time)
            if res_acc:
                res_acc.last_node_ids[instance_id] = conn.target.node_id
                res_acc.on_release(self.env.now, instance_id)
                if not res_acc._acquire_times and res_acc.requests_queued == 0:
                    self.collector.logger.log(
                        time=self.env.now, event_type="RESOURCE_IDLE",
                        resource_id=conn.transport_resource_id,
                        resource_label=res_acc.name,
                        details=f"{res_acc.name} is now idle",
                    )
        self.collector.logger.log(
            time=self.env.now, event_type="PART_TRANSPORT_END",
            entity_id=entity_id,
            node_id=conn.target.node_id, node_label=conn.target.label,
            resource_id=conn.transport_resource_id,
            resource_label=res_acc.name if res_acc else None,
            resource_instance=res_acc.log_instance(instance_id) if res_acc else None,
            details=f"Part {entity_id} delivered to {conn.target.label}",
        )
        conn.target._pending_arrivals -= 1
        self.collector.in_transit -= 1
        conn.target.submit(entity_id, arrived_at)

    def _transport_batch(self, batch: List[Tuple[int, float]], conn: DownstreamConnection):
        """SimPy process: acquire transport resource once, travel, then deliver the whole batch.

        _pending_arrivals is already incremented per entity when added to the buffer
        in _route_downstream, so only in_transit needs to be updated here.
        """
        res_acc = self.collector.resources.get(conn.transport_resource_id) if conn.transport_resource_id else None
        for _ in batch:
            self.collector.in_transit += 1
        if res_acc:
            res_acc.requests_queued += 1
        with conn.transport_resource.request() as req:  # type: ignore[union-attr]
            yield req
            instance_id = 1
            if res_acc:
                res_acc.requests_queued -= 1
                instance_id = res_acc.on_acquire(self.env.now)
            for entity_id, _ in batch:
                self.collector.logger.log(
                    time=self.env.now, event_type="PART_TRANSPORT_START",
                    entity_id=entity_id,
                    node_id=conn.target.node_id, node_label=conn.target.label,
                    resource_id=conn.transport_resource_id,
                    resource_label=res_acc.name if res_acc else None,
                    resource_instance=res_acc.log_instance(instance_id) if res_acc else None,
                    details=(
                        f"Part {entity_id} transport (batch of {len(batch)}): {self.label} → {conn.target.label}"
                        + (f" by {res_acc.display_name(instance_id)}" if res_acc else "")
                    ),
                )
            if conn.travel_time > 0:
                yield self.env.timeout(conn.travel_time)
            if res_acc:
                res_acc.last_node_ids[instance_id] = conn.target.node_id
                res_acc.on_release(self.env.now, instance_id)
                if not res_acc._acquire_times and res_acc.requests_queued == 0:
                    self.collector.logger.log(
                        time=self.env.now, event_type="RESOURCE_IDLE",
                        resource_id=conn.transport_resource_id,
                        resource_label=res_acc.name,
                        details=f"{res_acc.name} is now idle",
                    )
        for entity_id, arrived_at in batch:
            self.collector.logger.log(
                time=self.env.now, event_type="PART_TRANSPORT_END",
                entity_id=entity_id,
                node_id=conn.target.node_id, node_label=conn.target.label,
                resource_id=conn.transport_resource_id,
                resource_label=res_acc.name if res_acc else None,
                resource_instance=res_acc.log_instance(instance_id) if res_acc else None,
                details=f"Part {entity_id} delivered to {conn.target.label} (batch of {len(batch)})",
            )
            conn.target._pending_arrivals -= 1
            self.collector.in_transit -= 1
            conn.target.submit(entity_id, arrived_at)
