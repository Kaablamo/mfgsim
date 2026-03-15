from __future__ import annotations
from pydantic import BaseModel


class WorkcenterModel(BaseModel):
    id: str
    name: str
    capacity: int = 1   # parts allowed simultaneously in this workcenter
