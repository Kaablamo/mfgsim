from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, List

MAX_EVENTS = 50_000


@dataclass
class SimEvent:
    time: float
    event_type: str
    entity_id: Optional[int] = None
    node_id: Optional[str] = None
    node_label: Optional[str] = None
    resource_id: Optional[str] = None
    resource_label: Optional[str] = None
    resource_instance: Optional[int] = None
    details: Optional[str] = None


class EventLogger:
    def __init__(self) -> None:
        self._events: List[SimEvent] = []
        self.truncated: bool = False

    def log(self, **kwargs) -> None:  # type: ignore[no-untyped-def]
        if len(self._events) >= MAX_EVENTS:
            self.truncated = True
            return
        self._events.append(SimEvent(**kwargs))

    def reset(self) -> None:
        self._events.clear()
        self.truncated = False

    @property
    def events(self) -> List[SimEvent]:
        return self._events
