"""
SimulationEngine — orchestrates the SimPy simulation in a background thread
and emits state updates back to the asyncio event loop via a broadcast callback.
"""
from __future__ import annotations
import asyncio
import threading
import time
from typing import Callable, Coroutine, Any, List

import numpy as np
import simpy

from app.models.graph_models import GraphModel
from app.models.resource_models import ResourceModel, ResourceTravelTimes
from app.models.sim_config_models import SimConfigModel
from app.models.workcenter_models import WorkcenterModel
import dataclasses
from app.models.ws_messages import (
    TickPayload, SummaryPayload, StatusPayload, ErrorPayload, EventLogPayload,
)
from app.simulation.collector import StatsCollector
from app.simulation.graph_builder import build_graph
from app.simulation.nodes.source_node import SourceNode

BroadcastFn = Callable[[str], Coroutine[Any, Any, None]]


class SimulationEngine:
    def __init__(
        self,
        graph: GraphModel,
        resources: List[ResourceModel],
        config: SimConfigModel,
        asyncio_loop: asyncio.AbstractEventLoop,
        broadcast: BroadcastFn,
        travel_times: List[ResourceTravelTimes] | None = None,
        workcenters: List[WorkcenterModel] | None = None,
    ) -> None:
        self._graph = graph
        self._resources = resources
        self._config = config
        self._loop = asyncio_loop
        self._broadcast = broadcast
        self._travel_times = travel_times or []
        self._workcenters = workcenters or []
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self.state = "idle"

    # ------------------------------------------------------------------
    # Public control interface (called from asyncio thread)
    # ------------------------------------------------------------------

    def start(self) -> None:
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    # ------------------------------------------------------------------
    # Internal — runs in background thread
    # ------------------------------------------------------------------

    def _emit(self, payload_json: str) -> None:
        asyncio.run_coroutine_threadsafe(self._broadcast(payload_json), self._loop)

    def _emit_status(self, state: str) -> None:
        self.state = state
        msg = StatusPayload(state=state)  # type: ignore[arg-type]
        self._emit(msg.model_dump_json())

    def _run(self) -> None:
        wall_start = time.monotonic()
        rng = np.random.default_rng(self._config.rng_seed)
        collector = StatsCollector()
        env = simpy.Environment()
        config = self._config

        try:
            # ---- Build graph (warm-up mode if warmup_period > 0) ----
            warmup = config.warmup_period > 0
            sim_nodes = build_graph(env, self._graph, self._resources, collector, rng,
                                    warmup_mode=False, travel_times=self._travel_times,
                                    workcenters=self._workcenters)

            sources: list[SourceNode] = [
                n for n in sim_nodes.values() if isinstance(n, SourceNode)
            ]

            # ---- Warm-up phase ----
            if warmup:
                self._emit_status("warmup")
                # Temporarily switch sources to flood mode
                for src in sources:
                    src.warmup_mode = True
                for src in sources:
                    src.start()
                env.run(until=config.warmup_period)
                # Reset stats but leave entities in system
                collector.reset_stats(env.now)
                # Switch sources back to normal rate
                for src in sources:
                    src.warmup_mode = False

            else:
                for src in sources:
                    src.start()

            # ---- Main simulation run ----
            self._emit_status("running")

            tick_until = env.now + config.tick_interval
            run_end = env.now + (config.duration - config.warmup_period)

            while env.now < run_end and not self._stop_event.is_set():
                # Advance sim by one tick interval
                next_stop = min(tick_until, run_end)
                env.run(until=next_stop)

                # Emit tick
                node_stats, res_stats, wip = collector.snapshot(env.now)
                tick = TickPayload(
                    sim_time=round(env.now, 4),
                    nodes=node_stats,
                    resources=res_stats,
                    total_wip=wip,
                )
                self._emit(tick.model_dump_json())
                tick_until += config.tick_interval

            # ---- Snapshot at run_end BEFORE drain (so summary matches last tick) ----
            pre_drain_snapshot: tuple | None = None
            if not self._stop_event.is_set():
                ns, rs, _ = collector.snapshot(env.now)
                tp = sum(s.total_completed for s in ns if s.node_type == "sink")
                pre_drain_snapshot = (ns, rs, tp)

            # ---- Drain phase: stop new arrivals, let in-flight entities finish ----
            if not self._stop_event.is_set():
                for src in sources:
                    src.stop()
                # Run until no events remain (all in-flight entities reach the sink)
                env.run()

            # ---- Summary ----
            if not self._stop_event.is_set() and pre_drain_snapshot is not None:
                node_stats, res_stats, total_tp = pre_drain_snapshot
                summary = SummaryPayload(
                    total_sim_time=round(run_end, 4),
                    nodes=node_stats,
                    resources=res_stats,
                    total_throughput=total_tp,
                    sim_run_seconds=round(time.monotonic() - wall_start, 3),
                )
                self._emit(summary.model_dump_json())
                event_payload = EventLogPayload(
                    events=[dataclasses.asdict(e) for e in collector.logger.events],
                    truncated=collector.logger.truncated,
                )
                self._emit(event_payload.model_dump_json())

        except Exception as exc:  # noqa: BLE001
            err = ErrorPayload(code="ENGINE_ERROR", message=str(exc))
            self._emit(err.model_dump_json())

        finally:
            self._emit_status("stopped")
