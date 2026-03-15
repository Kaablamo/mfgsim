"""
Handles serialization and deserialization of MfgSim project files.
The file format is JSON internally; the current user-facing extension is .mfgsim.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, List

from app.models.graph_models import GraphModel
from app.models.resource_models import ResourceModel
from app.models.sim_config_models import SimConfigModel

SIM_FILE_VERSION = "1.0"


def build_payload(
    name: str,
    graph: GraphModel,
    resources: List[ResourceModel],
    sim_config: SimConfigModel,
) -> Dict[str, Any]:
    return {
        "version": SIM_FILE_VERSION,
        "meta": {
            "name": name,
            "modified_at": datetime.now(timezone.utc).isoformat(),
        },
        "graph": graph.model_dump(),
        "resources": [r.model_dump() for r in resources],
        "sim_config": sim_config.model_dump(),
    }


def parse_payload(raw: Dict[str, Any]) -> tuple[GraphModel, List[ResourceModel], SimConfigModel, str]:
    name = raw.get("meta", {}).get("name", "Untitled")
    graph = GraphModel(**raw["graph"])
    resources = [ResourceModel(**r) for r in raw.get("resources", [])]
    sim_config = SimConfigModel(**raw.get("sim_config", {}))
    return graph, resources, sim_config, name
