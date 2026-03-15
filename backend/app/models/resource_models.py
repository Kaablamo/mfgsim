from __future__ import annotations
from typing import List
from pydantic import BaseModel


class ResourceModel(BaseModel):
    id: str
    name: str
    quantity: int = 1


class TravelEntry(BaseModel):
    from_node_id: str
    to_node_id: str
    time: float


class ResourceTravelTimes(BaseModel):
    resource_id: str
    entries: List[TravelEntry] = []
