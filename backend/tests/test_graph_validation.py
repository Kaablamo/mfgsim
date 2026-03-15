from __future__ import annotations

import asyncio

from app.api.routes.graph import validate_graph

from .helpers import fixed_distribution, make_graph


def test_validate_graph_rejects_batch_threshold_above_batch_size() -> None:
    graph = make_graph(
        nodes=[
            {
                "id": "node_1",
                "type": "source",
                "data": {"label": "Source", "inter_arrival": fixed_distribution(1)},
            },
            {
                "id": "node_2",
                "type": "process",
                "data": {
                    "label": "Washer",
                    "duration": fixed_distribution(1),
                    "batch_size": 2,
                    "min_batch_size": 3,
                },
            },
            {"id": "node_3", "type": "sink", "data": {"label": "Sink"}},
        ],
        edges=[
            {"id": "edge_1", "source": "node_1", "target": "node_2"},
            {"id": "edge_2", "source": "node_2", "target": "node_3"},
        ],
    )

    result = asyncio.run(validate_graph(graph))

    assert result.valid is False
    assert any("greater than Batch Size 2" in error.message for error in result.errors)


def test_validate_graph_rejects_source_that_cannot_reach_sink() -> None:
    graph = make_graph(
        nodes=[
            {
                "id": "node_1",
                "type": "source",
                "data": {"label": "Disconnected Source", "inter_arrival": fixed_distribution(1)},
            },
            {"id": "node_2", "type": "process", "data": {"label": "Isolated", "duration": fixed_distribution(1)}},
            {"id": "node_3", "type": "sink", "data": {"label": "Sink"}},
        ],
        edges=[],
    )

    result = asyncio.run(validate_graph(graph))

    assert result.valid is False
    assert any("cannot reach any Sink" in error.message for error in result.errors)
