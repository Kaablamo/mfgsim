from __future__ import annotations
import asyncio
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.graph_models import GraphModel
from app.models.resource_models import ResourceModel, ResourceTravelTimes
from app.models.sim_config_models import SimConfigModel
from app.models.workcenter_models import WorkcenterModel
from app.simulation.engine import SimulationEngine
from app.api.websockets.manager import manager

router = APIRouter(prefix="/api/sim")

# In-memory run state (single run at a time for MVP)
_current_engine: Optional[SimulationEngine] = None
_current_run_id: Optional[str] = None


class RunRequest(BaseModel):
    graph: GraphModel
    resources: List[ResourceModel] = []
    workcenters: List[WorkcenterModel] = []
    sim_config: SimConfigModel = SimConfigModel()
    travel_times: List[ResourceTravelTimes] = []


class StopRequest(BaseModel):
    run_id: str


def stop_active_engine() -> None:
    global _current_engine
    if _current_engine is not None:
        _current_engine.stop()


@router.post("/run")
async def run_simulation(req: RunRequest):
    global _current_engine, _current_run_id

    # Stop any existing run
    stop_active_engine()

    run_id = str(uuid.uuid4())
    _current_run_id = run_id

    loop = asyncio.get_running_loop()
    engine = SimulationEngine(
        graph=req.graph,
        resources=req.resources,
        workcenters=req.workcenters,
        config=req.sim_config,
        asyncio_loop=loop,
        broadcast=manager.broadcast,
        travel_times=req.travel_times,
    )
    _current_engine = engine
    engine.start()

    return {"run_id": run_id, "status": "started"}


@router.post("/stop")
async def stop_simulation(req: StopRequest):
    global _current_engine, _current_run_id
    if _current_engine is None or req.run_id != _current_run_id:
        raise HTTPException(status_code=404, detail="No matching run found")
    stop_active_engine()
    return {"status": "stopped"}


@router.get("/status")
async def get_status():
    state = _current_engine.state if _current_engine else "idle"
    return {"state": state, "run_id": _current_run_id}
