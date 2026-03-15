from __future__ import annotations
from typing import Dict
import simpy
import numpy as np
from app.simulation.nodes.base_node import BaseSimNode, DownstreamConnection
from app.simulation.collector import StatsCollector
from app.simulation import distributions
from app.models.graph_models import DistributionConfig


class ProcessNode(BaseSimNode):
    """
    Supports two processing modes:

    Single-piece flow (batch_size=1, min_batch_size=1):
        Each entity gets its own coroutine and competes for a server slot.
        Multiple server slots (capacity > 1) run in parallel.

    Batch flow (batch_size > 1 or min_batch_size > 1):
        A coordinator coroutine collects entities until min_batch_size are
        queued, then processes up to batch_size in a single service cycle.
        One batch runs at a time (server capacity fixed at 1 in this mode).

    resource_performs_process=True  (manual / robot station):
        Resource is held for the full process_time.

    resource_performs_process=False (automated machine):
        Resource is acquired to load/stage the part, then immediately released
        while the machine runs autonomously.

    Infeed WIP (max_infeed):
        Soft routing cap on the input queue.
        max_infeed=None → unlimited (default).
        max_infeed=0    → no infeed area; routing avoids this node when
                          anyone is already waiting.
        max_infeed=N    → routing avoids once N parts are queued.
        Batch exception: while a batch station is idle and still below its
        min_batch_size threshold, routing temporarily allows enough staged WIP
        to fund the first batch even if max_infeed is smaller.

    Outfeed WIP (max_outfeed):
        Hard outfeed buffer after the server.  After processing completes the
        entity must acquire an outfeed slot before the server is released.
        If all slots are occupied the server (machine) is blocked until a
        slot frees up.  A drain coroutine empties the outfeed buffer by
        routing entities downstream as fast as possible.
        max_outfeed=None → no outfeed buffer; entities route immediately
                           (default, current behaviour).
        max_outfeed=0    → outfeed area exists but is unlimited; machine never
                           blocks.  Server is still released into outfeed so
                           the drain handles downstream routing asynchronously.
        max_outfeed=N    → outfeed holds up to N parts; machine blocks
                           when outfeed is full.

    Workcenter (workcenter_id, workcenter, workcenter_holds):
        Groups co-located process steps so only N parts are active in the
        physical location simultaneously (N = workcenter capacity).
        - Acquisition: entity acquires the workcenter resource once, after
          it claims the first server slot, the first time it enters this
          workcenter chain.
        - Hold: the entity keeps the workcenter resource across all steps in
          the same workcenter_id chain.
        - Release: the workcenter resource is released in _route_after_process
          when the entity routes to a node with a different (or no) workcenter.
        - Not supported in batch mode (workcenter constraint is silently ignored
          for nodes with batch_size > 1 or min_batch_size > 1).
    """

    _PRIORITY_RANK = {"low": 0, "medium": 1, "high": 2, "bottleneck": 3}

    def __init__(
        self,
        node_id: str,
        label: str,
        env: simpy.Environment,
        collector: StatsCollector,
        duration: DistributionConfig,
        capacity: int,
        rng: np.random.Generator,
        resource: simpy.Resource | None = None,
        resource_id: str | None = None,
        resource_performs_process: bool = True,
        travel_times: Dict[str, Dict[str, float]] | None = None,
        batch_size: int = 1,
        min_batch_size: int = 1,
        priority: str = "medium",
        max_infeed: int | None = None,
        max_outfeed: int | None = None,
        fallout_rate: float = 0.0,
        workcenter: simpy.Resource | None = None,
        workcenter_id: str | None = None,
        workcenter_holds: dict | None = None,
    ) -> None:
        super().__init__(node_id, label, env, collector)
        self.duration = duration
        self.rng = rng
        self.resource = resource
        self.resource_id = resource_id
        self.resource_performs_process = resource_performs_process
        self.travel_times = travel_times or {}
        self.batch_size = max(1, batch_size)
        self.min_batch_size = max(1, min_batch_size)
        self._is_batch = self.batch_size > 1 or self.min_batch_size > 1

        # Workcenter: shared resource + entity-level hold tracking
        self.workcenter = workcenter
        self.workcenter_id = workcenter_id
        # workcenter_holds is a shared dict across all nodes in the same simulation.
        # Using 'if workcenter_holds is not None' to allow passing an empty dict.
        self.workcenter_holds: dict = workcenter_holds if workcenter_holds is not None else {}

        # In batch mode: one coordinator processes batches sequentially
        server_cap = 1 if self._is_batch else capacity
        self._server = simpy.Resource(env, capacity=server_cap)
        collector.register_node(node_id, label, capacity, node_type="process")

        # Expose routing attributes so _choose_downstream can use them
        self.routing_priority = self._PRIORITY_RANK.get(priority, 1)
        self.node_min_batch_size = self.min_batch_size
        self.node_max_infeed = max_infeed  # used by routing score in base_node
        self.fallout_rate = max(0.0, min(1.0, fallout_rate))

        # Outfeed buffer: entities must acquire a slot after processing;
        # server is held (blocking) until a slot is available.
        # max_outfeed=0  → unlimited store (server never blocks on outfeed)
        # max_outfeed=N  → store of N; server blocks when full
        self._outfeed: simpy.Store | None = None
        if max_outfeed is not None:
            self._outfeed = (simpy.Store(env) if max_outfeed == 0
                             else simpy.Store(env, capacity=max_outfeed))
            env.process(self._outfeed_drain())

        if self._is_batch:
            self._store: simpy.Store = simpy.Store(env)
            env.process(self._batch_coordinator())

    def submit(self, entity_id: int, arrived_at: float) -> None:
        acc = self.collector.nodes[self.node_id]
        acc.queue_length += 1
        self.collector.logger.log(
            time=self.env.now, event_type="PART_QUEUED",
            entity_id=entity_id, node_id=self.node_id, node_label=self.label,
            details=f"Part {entity_id} queued at {self.label} (queue: {acc.queue_length})",
        )
        if self._is_batch:
            self._store.put((entity_id, arrived_at))
        else:
            self.env.process(self._process(entity_id, arrived_at))

    def routing_infeed_limit(self, effective_queue: int, in_process: int) -> int | None:
        """Allow idle batch stations to stage enough parts to start once."""
        if self.node_max_infeed is None or not self._is_batch:
            return self.node_max_infeed

        if in_process == 0 and effective_queue < self.min_batch_size:
            base_limit = 1 if self.node_max_infeed == 0 else self.node_max_infeed
            return max(base_limit, self.min_batch_size)

        return self.node_max_infeed

    # ── Workcenter helpers ────────────────────────────────────────────────────

    def _maybe_release_workcenter(self, entity_id: int, dest_conn: DownstreamConnection | None) -> None:
        """Release the workcenter resource if the entity is routing out of this workcenter.

        No-op when:
        - This node has no workcenter
        - The entity doesn't hold a workcenter slot
        - The destination is in the same workcenter (rework loops, consecutive steps)
        """
        if not self.workcenter_id or entity_id not in self.workcenter_holds:
            return
        dest_wc_id = getattr(dest_conn.target, 'workcenter_id', None) if dest_conn else None
        if dest_wc_id != self.workcenter_id:
            _, wc_req = self.workcenter_holds.pop(entity_id)
            self.workcenter.release(wc_req)  # type: ignore[union-attr]
            self._notify_capacity_change()  # workcenter slot freed — wake deferred routers
            # Also fire the per-workcenter shared event so upstream waiters that are
            # watching the ENTRY node's _capacity_event (not this exit node's) are woken
            # up too.  Without this, coroutines blocked on e.g. "Nest 1 Clamp Part"'s
            # event would never see the release that happened on "Nest 1 Uncamp Part".
            wc_ev = self._wc_capacity_events.get(self.workcenter_id)
            if wc_ev is not None:
                self._wc_capacity_events[self.workcenter_id] = self.env.event()
                if not wc_ev.triggered:
                    wc_ev.succeed()

    # ── Fallout routing ───────────────────────────────────────────────────────

    def _route_after_process(self, entity_id: int, arrived_at: float) -> None:
        """Route entity downstream, applying fallout roll if configured.

        On fallout: logs PART_FALLOUT and sends the part via the rework edge.
        arrived_at is reset to now so downstream cycle-time stats reflect only
        the rework leg, not accumulated time from the original production path.

        Workcenter release: determined by peeking at the chosen destination.
        Rework loops within the same workcenter keep the hold; routing out
        releases it before the entity moves.

        Blocked downstream: if all eligible destinations are hard-blocked (state=-1),
        routing is deferred via _deferred_routing_from_process WITHOUT releasing the
        workcenter — the entity waits (in a floating coroutine) until a destination
        opens up rather than being forced into a full queue.
        """
        if self.fallout_rate > 0.0 and self.rng.random() < self.fallout_rate:
            self.collector.logger.log(
                time=self.env.now, event_type="PART_FALLOUT",
                entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                details=f"Part {entity_id} failed at {self.label} ({self.fallout_rate*100:.1f}% rate) — rework",
            )
            # Determine destination for workcenter release check
            fallout_conn = next((c for c in self.downstream if c.is_fallout), None)
            if fallout_conn:
                self._maybe_release_workcenter(entity_id, fallout_conn)
            else:
                # No fallout edge → _route_fallout falls back to _route_downstream
                peek_conn = self._choose_downstream(entity_id)
                self._maybe_release_workcenter(entity_id, peek_conn)
            self._route_fallout(entity_id, self.env.now)
        else:
            peek_conn = self._choose_downstream(entity_id)
            if peek_conn is not None:
                # Normal case: release WC if leaving the chain, then dispatch.
                self._maybe_release_workcenter(entity_id, peek_conn)
                self._dispatch_to_conn(entity_id, arrived_at, peek_conn)
            elif any(not c.is_fallout for c in self.downstream):
                # Connections exist but all blocked (workcenter full, infeed cap, etc.).
                # Defer WITHOUT releasing the workcenter; entity waits upstream.
                self.env.process(self._deferred_routing_from_process(entity_id, arrived_at))
            else:
                # End of line: no downstream connections at all.
                self._maybe_release_workcenter(entity_id, None)

    def _deferred_routing_from_process(self, entity_id: int, arrived_at: float):
        """SimPy process: wait for downstream capacity, then route.

        Mirrors BaseSimNode._deferred_routing but also handles workcenter release
        when a destination finally becomes available.  Uses event-driven waiting
        instead of timeout(0) polling to avoid freezing the simulation clock.
        """
        while True:
            peek_conn = self._choose_downstream(entity_id)
            if peek_conn is not None:
                self._maybe_release_workcenter(entity_id, peek_conn)
                self._dispatch_to_conn(entity_id, arrived_at, peek_conn)
                return
            events = self._downstream_capacity_events()
            if not events:
                self._maybe_release_workcenter(entity_id, None)
                return
            yield self.env.any_of(events)

    # ── Outfeed drain ─────────────────────────────────────────────────────────

    def _outfeed_drain(self):
        """Continuously pull from outfeed buffer and route downstream."""
        acc = self.collector.nodes[self.node_id]
        while True:
            entity_id, arrived_at = yield self._outfeed.get()  # type: ignore[union-attr]
            self.collector.logger.log(
                time=self.env.now, event_type="PART_OUTFEED_LEAVE",
                entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                details=f"Part {entity_id} leaving outfeed buffer at {self.label}",
            )
            acc.in_process -= 1
            self._notify_capacity_change()
            self._route_after_process(entity_id, arrived_at)

    # ── Single-piece flow ────────────────────────────────────────────────────

    def _process(self, entity_id: int, arrived_at: float):
        acc = self.collector.nodes[self.node_id]
        res_acc = self.collector.resources.get(self.resource_id) if self.resource_id else None

        with self._server.request() as server_req:
            yield server_req

            # ── Workcenter gate (single-piece flow only) ──────────────────────
            # Claim the workcenter only when the part is actually leaving queue
            # and entering the active server slot. Reserving it earlier lets
            # queued parts consume workcenter capacity and can deadlock transfers
            # between adjacent workcenters.
            if self.workcenter is not None and not self._is_batch:
                if entity_id not in self.workcenter_holds:
                    wc_req = self.workcenter.request()
                    yield wc_req
                    self.workcenter_holds[entity_id] = (self.workcenter_id, wc_req)
                # else: entity already holds this workcenter slot — proceed immediately

            acc.queue_length -= 1
            acc.in_process += 1
            self._notify_capacity_change()  # infeed queue slot freed
            process_start = self.env.now

            if self.resource is not None:
                if self.resource_performs_process:
                    if res_acc:
                        res_acc.requests_queued += 1
                    with self.resource.request() as res_req:
                        yield res_req
                        instance_id = 1
                        if res_acc:
                            res_acc.requests_queued -= 1
                            instance_id = res_acc.on_acquire(self.env.now)
                            last_node = res_acc.last_node_ids.get(instance_id)
                            if last_node and self.travel_times:
                                travel = self.travel_times.get(last_node, {}).get(self.node_id, 0.0)
                                if travel > 0:
                                    yield self.env.timeout(travel)
                        # Actual work starts now (after resource acquired + travel)
                        self.collector.logger.log(
                            time=self.env.now, event_type="PART_PROCESS_START",
                            entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                            resource_id=self.resource_id,
                            resource_label=res_acc.name if res_acc else None,
                            resource_instance=res_acc.log_instance(instance_id) if res_acc else None,
                            details=(
                                f"Part {entity_id} processing at {self.label}"
                                + (f" by {res_acc.display_name(instance_id)}" if res_acc else "")
                            ),
                        )
                        service_time = distributions.sample(self.duration, self.rng)
                        yield self.env.timeout(max(0.0, service_time))
                        if res_acc:
                            res_acc.last_node_ids[instance_id] = self.node_id
                            res_acc.on_release(self.env.now, instance_id)
                            if not res_acc._acquire_times and res_acc.requests_queued == 0:
                                self.collector.logger.log(
                                    time=self.env.now, event_type="RESOURCE_IDLE",
                                    resource_id=self.resource_id,
                                    resource_label=res_acc.name,
                                    details=f"{res_acc.name} is now idle",
                                )
                else:
                    if res_acc:
                        res_acc.requests_queued += 1
                    with self.resource.request() as res_req:
                        yield res_req
                        instance_id = 1
                        if res_acc:
                            res_acc.requests_queued -= 1
                            instance_id = res_acc.on_acquire(self.env.now)
                            res_acc.last_node_ids[instance_id] = self.node_id
                            res_acc.on_release(self.env.now, instance_id)
                            if not res_acc._acquire_times and res_acc.requests_queued == 0:
                                self.collector.logger.log(
                                    time=self.env.now, event_type="RESOURCE_IDLE",
                                    resource_id=self.resource_id,
                                    resource_label=res_acc.name,
                                    details=f"{res_acc.name} is now idle",
                                )
                    # Machine runs autonomously — process starts after load
                    self.collector.logger.log(
                        time=self.env.now, event_type="PART_PROCESS_START",
                        entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                        details=f"Part {entity_id} processing at {self.label} (automated)",
                    )
                    service_time = distributions.sample(self.duration, self.rng)
                    yield self.env.timeout(max(0.0, service_time))
            else:
                self.collector.logger.log(
                    time=self.env.now, event_type="PART_PROCESS_START",
                    entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                    details=f"Part {entity_id} processing at {self.label}",
                )
                service_time = distributions.sample(self.duration, self.rng)
                yield self.env.timeout(max(0.0, service_time))

            process_end = self.env.now
            duration_actual = process_end - process_start
            self.collector.logger.log(
                time=process_end, event_type="PART_PROCESS_END",
                entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                details=f"Part {entity_id} done at {self.label} (duration: {duration_actual:.2f})",
            )

            # ── Move finished entity to outfeed (blocks if full) ──────────────
            if self._outfeed is not None:
                self.collector.logger.log(
                    time=self.env.now, event_type="PART_OUTFEED_ENTER",
                    entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                    details=f"Part {entity_id} entered outfeed buffer at {self.label}",
                )
                yield self._outfeed.put((entity_id, arrived_at))
                # server releases here; record stats while still holding server
                process_end = self.env.now
                busy_duration = process_end - process_start
                acc.record_completion(process_end - arrived_at, busy_duration)
                # in_process stays elevated; drain will decrement when entity leaves outfeed
                return

            # ── No outfeed: block server until output path is ready, then route ──
            # Without an outfeed buffer this machine has nowhere to hold a finished
            # part.  Keep the server slot occupied while all downstream connections
            # are hard-blocked (workcenter full, infeed cap, etc.) so that upstream
            # routing sees this node as busy and won't send more parts into it.
            # Yield on downstream _capacity_events instead of timeout(0) so the
            # simulation clock can advance to the next real event (e.g. a downstream
            # machine finishing) rather than spinning at the current time step.
            if any(not c.is_fallout for c in self.downstream):
                while self._choose_downstream(entity_id) is None:
                    yield self.env.any_of(self._downstream_capacity_events())

            busy_duration = process_end - process_start
            cycle_time = process_end - arrived_at
            acc.in_process -= 1
            acc.record_completion(cycle_time, busy_duration)
            self._notify_capacity_change()  # server slot freeing — wake deferred routers
            self._route_after_process(entity_id, arrived_at)
            # Server releases here when the `with server_req` block exits.

    # ── Batch flow ───────────────────────────────────────────────────────────

    def _batch_coordinator(self):
        acc = self.collector.nodes[self.node_id]
        res_acc = self.collector.resources.get(self.resource_id) if self.resource_id else None

        while True:
            # ── Collect batch: block on each entity until min_batch_size met ─
            batch: list[tuple[int, float]] = []
            while len(batch) < self.min_batch_size:
                item = yield self._store.get()
                batch.append(item)

            # Opportunistically drain more items up to batch_size (no blocking)
            while len(batch) < self.batch_size and self._store.items:
                batch.append(self._store.items.pop(0))

            # ── Acquire server slot (batch still counted as queue) ───────────
            with self._server.request() as server_req:
                yield server_req

                # Batch moves from queue → in-process
                acc.queue_length -= len(batch)
                acc.in_process += len(batch)
                process_start = self.env.now

                # ── Resource handling (mirrors single-piece logic) ────────────
                if self.resource is not None:
                    if self.resource_performs_process:
                        if res_acc:
                            res_acc.requests_queued += 1
                        with self.resource.request() as res_req:
                            yield res_req
                            instance_id = 1
                            if res_acc:
                                res_acc.requests_queued -= 1
                                instance_id = res_acc.on_acquire(self.env.now)
                                last_node = res_acc.last_node_ids.get(instance_id)
                                if last_node and self.travel_times:
                                    travel = self.travel_times.get(last_node, {}).get(self.node_id, 0.0)
                                    if travel > 0:
                                        yield self.env.timeout(travel)
                            for entity_id, _ in batch:
                                self.collector.logger.log(
                                    time=self.env.now, event_type="PART_PROCESS_START",
                                    entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                                    resource_id=self.resource_id,
                                    resource_label=res_acc.name if res_acc else None,
                                    resource_instance=res_acc.log_instance(instance_id) if res_acc else None,
                                    details=(
                                        f"Part {entity_id} batch processing at {self.label}"
                                        + (f" by {res_acc.display_name(instance_id)}" if res_acc else "")
                                    ),
                                )
                            service_time = distributions.sample(self.duration, self.rng)
                            yield self.env.timeout(max(0.0, service_time))
                            if res_acc:
                                res_acc.last_node_ids[instance_id] = self.node_id
                                res_acc.on_release(self.env.now, instance_id)
                                if not res_acc._acquire_times and res_acc.requests_queued == 0:
                                    self.collector.logger.log(
                                        time=self.env.now, event_type="RESOURCE_IDLE",
                                        resource_id=self.resource_id,
                                        resource_label=res_acc.name,
                                        details=f"{res_acc.name} is now idle",
                                    )
                    else:
                        if res_acc:
                            res_acc.requests_queued += 1
                        with self.resource.request() as res_req:
                            yield res_req
                            instance_id = 1
                            if res_acc:
                                res_acc.requests_queued -= 1
                                instance_id = res_acc.on_acquire(self.env.now)
                                res_acc.last_node_ids[instance_id] = self.node_id
                                res_acc.on_release(self.env.now, instance_id)
                                if not res_acc._acquire_times and res_acc.requests_queued == 0:
                                    self.collector.logger.log(
                                        time=self.env.now, event_type="RESOURCE_IDLE",
                                        resource_id=self.resource_id,
                                        resource_label=res_acc.name,
                                        details=f"{res_acc.name} is now idle",
                                    )
                        for entity_id, _ in batch:
                            self.collector.logger.log(
                                time=self.env.now, event_type="PART_PROCESS_START",
                                entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                                details=f"Part {entity_id} batch processing at {self.label} (automated)",
                            )
                        service_time = distributions.sample(self.duration, self.rng)
                        yield self.env.timeout(max(0.0, service_time))
                else:
                    for entity_id, _ in batch:
                        self.collector.logger.log(
                            time=self.env.now, event_type="PART_PROCESS_START",
                            entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                            details=f"Part {entity_id} batch processing at {self.label}",
                        )
                    service_time = distributions.sample(self.duration, self.rng)
                    yield self.env.timeout(max(0.0, service_time))

                process_end = self.env.now
                busy_duration = process_end - process_start
                per_entity_busy = busy_duration / len(batch)

                for entity_id, arrived_at in batch:
                    self.collector.logger.log(
                        time=process_end, event_type="PART_PROCESS_END",
                        entity_id=entity_id, node_id=self.node_id, node_label=self.label,
                        details=f"Part {entity_id} done at {self.label} (duration: {busy_duration:.2f})",
                    )

                # ── Move batch to outfeed (blocks per-entity if outfeed full) ─
                if self._outfeed is not None:
                    for item in batch:
                        entity_id_item = item[0]
                        self.collector.logger.log(
                            time=self.env.now, event_type="PART_OUTFEED_ENTER",
                            entity_id=entity_id_item, node_id=self.node_id, node_label=self.label,
                            details=f"Part {entity_id_item} entered outfeed buffer at {self.label}",
                        )
                        yield self._outfeed.put(item)
                    # server releases here; drain handles in_process + routing

            process_end = self.env.now
            busy_duration = process_end - process_start
            per_entity_busy = busy_duration / len(batch)

            if self._outfeed is None:
                acc.in_process -= len(batch)
                self._notify_capacity_change()
                for entity_id, arrived_at in batch:
                    cycle_time = process_end - arrived_at
                    acc.record_completion(cycle_time, per_entity_busy)
                    self._route_after_process(entity_id, arrived_at)
            else:
                # Stats recorded when entities leave server; drain handles in_process + routing
                for entity_id, arrived_at in batch:
                    cycle_time = process_end - arrived_at
                    acc.record_completion(cycle_time, per_entity_busy)
                # in_process stays elevated per entity; drain decrements each as it routes
