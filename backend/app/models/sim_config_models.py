from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class SimConfigModel(BaseModel):
    duration: float = Field(default=480.0, gt=0)
    warmup_period: float = Field(default=0.0, ge=0)
    rng_seed: Optional[int] = None
    tick_interval: float = Field(default=1.0, gt=0)
