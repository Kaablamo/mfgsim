from __future__ import annotations

from app.models.sim_config_models import SimConfigModel

from .helpers import first_payload, fixed_distribution, make_graph, run_engine_sync


def test_simple_linear_model_completes_expected_parts() -> None:
    graph = make_graph(
        nodes=[
            {
                "id": "node_1",
                "type": "source",
                "data": {
                    "label": "Source",
                    "inter_arrival": fixed_distribution(1),
                    "batch_size": 1,
                    "max_entities": 3,
                },
            },
            {
                "id": "node_2",
                "type": "process",
                "data": {
                    "label": "Process",
                    "duration": fixed_distribution(1),
                    "capacity": 1,
                },
            },
            {"id": "node_3", "type": "sink", "data": {"label": "Sink"}},
        ],
        edges=[
            {"id": "edge_1", "source": "node_1", "target": "node_2"},
            {"id": "edge_2", "source": "node_2", "target": "node_3"},
        ],
    )

    payloads = run_engine_sync(graph, config=SimConfigModel(duration=10, tick_interval=1))
    summary = first_payload(payloads, "summary")
    statuses = [payload["state"] for payload in payloads if payload["msg_type"] == "status"]

    assert statuses == ["running", "stopped"]
    assert summary["total_throughput"] == 3
    sink_stats = next(node for node in summary["nodes"] if node["node_type"] == "sink")
    assert sink_stats["total_completed"] == 3


def test_batch_process_can_stage_prestart_wip_without_infeed_area() -> None:
    graph = make_graph(
        nodes=[
            {
                "id": "node_1",
                "type": "source",
                "data": {
                    "label": "Source",
                    "inter_arrival": fixed_distribution(0),
                    "batch_size": 1,
                    "max_entities": 4,
                },
            },
            {
                "id": "node_2",
                "type": "process",
                "data": {
                    "label": "Wash",
                    "duration": fixed_distribution(1),
                    "capacity": 1,
                    "batch_size": 4,
                    "min_batch_size": 4,
                    "max_infeed": 0,
                },
            },
            {"id": "node_3", "type": "sink", "data": {"label": "Sink"}},
        ],
        edges=[
            {"id": "edge_1", "source": "node_1", "target": "node_2"},
            {"id": "edge_2", "source": "node_2", "target": "node_3"},
        ],
    )

    payloads = run_engine_sync(graph, config=SimConfigModel(duration=5, tick_interval=1))
    summary = first_payload(payloads, "summary")

    assert summary["total_throughput"] == 4
    process_stats = next(node for node in summary["nodes"] if node["node_id"] == "node_2")
    assert process_stats["total_completed"] == 4
