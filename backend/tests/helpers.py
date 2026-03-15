from __future__ import annotations

import asyncio
import json
from typing import Any

from app.models.graph_models import GraphModel
from app.models.resource_models import ResourceModel, ResourceTravelTimes
from app.models.sim_config_models import SimConfigModel
from app.models.workcenter_models import WorkcenterModel
from app.simulation.engine import SimulationEngine


def fixed_distribution(value: float) -> dict[str, Any]:
    return {"type": "fixed", "value": value}


def make_graph(*, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> GraphModel:
    return GraphModel.model_validate({"nodes": nodes, "edges": edges})


async def _noop_broadcast(_: str) -> None:
    return None


def run_engine_sync(
    graph: GraphModel,
    *,
    resources: list[ResourceModel] | None = None,
    workcenters: list[WorkcenterModel] | None = None,
    travel_times: list[ResourceTravelTimes] | None = None,
    config: SimConfigModel | None = None,
) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    loop = asyncio.new_event_loop()
    try:
        engine = SimulationEngine(
            graph=graph,
            resources=resources or [],
            workcenters=workcenters or [],
            config=config or SimConfigModel(),
            asyncio_loop=loop,
            broadcast=_noop_broadcast,
            travel_times=travel_times or [],
        )
        engine._emit = lambda payload_json: payloads.append(json.loads(payload_json))  # type: ignore[method-assign]
        engine._run()
    finally:
        loop.close()
    return payloads


def first_payload(payloads: list[dict[str, Any]], msg_type: str) -> dict[str, Any]:
    return next(payload for payload in payloads if payload["msg_type"] == msg_type)
