"""
Translates a GraphModel + ResourceModel list into live SimPy node objects
and wires their connections.
"""
from __future__ import annotations
import simpy
import numpy as np
from typing import Dict, List

from app.models.graph_models import GraphModel, NodeType, SourceNodeData, ProcessNodeData, SinkNodeData, StorageNodeData
from app.models.resource_models import ResourceModel, ResourceTravelTimes
from app.models.workcenter_models import WorkcenterModel
from app.simulation.collector import StatsCollector
from app.simulation.nodes.base_node import BaseSimNode, DownstreamConnection
from app.simulation.nodes.source_node import SourceNode
from app.simulation.nodes.process_node import ProcessNode
from app.simulation.nodes.sink_node import SinkNode
from app.simulation.nodes.storage_node import StorageNode


def build_graph(
    env: simpy.Environment,
    graph: GraphModel,
    resources: List[ResourceModel],
    collector: StatsCollector,
    rng: np.random.Generator,
    warmup_mode: bool = False,
    travel_times: List[ResourceTravelTimes] | None = None,
    workcenters: List[WorkcenterModel] | None = None,
) -> Dict[str, BaseSimNode]:
    """
    Returns a dict of node_id → SimNode.
    Sources are not yet started — call .start() on them to begin generation.
    """
    # Build SimPy resource objects keyed by resource id
    simpy_resources: Dict[str, simpy.Resource] = {}
    resource_map: Dict[str, ResourceModel] = {}
    for rm in resources:
        collector.register_resource(rm.id, rm.name, rm.quantity)
        simpy_resources[rm.id] = simpy.Resource(env, capacity=rm.quantity)
        resource_map[rm.id] = rm

    # Build SimPy workcenter resources keyed by workcenter id
    simpy_workcenters: Dict[str, simpy.Resource] = {}
    for wc in (workcenters or []):
        simpy_workcenters[wc.id] = simpy.Resource(env, capacity=wc.capacity)

    # Per-workcenter shared capacity events.  Each fires when ANY node in the
    # workcenter chain releases its slot.  This lets upstream waiters watching
    # the ENTRY node's _capacity_event also wake up when the exit node releases
    # (they are different node objects with separate _capacity_event instances).
    wc_capacity_events: Dict[str, simpy.Event] = {}
    for wc in (workcenters or []):
        wc_capacity_events[wc.id] = env.event()

    # Shared entity-workcenter tracking: entity_id → (workcenter_id, simpy.Request)
    # Passed by reference to every ProcessNode so they all see the same state.
    workcenter_holds: dict = {}

    # Build travel time lookup: resource_id → from_node_id → to_node_id → time
    travel_lookup: Dict[str, Dict[str, Dict[str, float]]] = {}
    for rtt in (travel_times or []):
        for entry in rtt.entries:
            (travel_lookup
             .setdefault(rtt.resource_id, {})
             .setdefault(entry.from_node_id, {}))[entry.to_node_id] = entry.time

    # Instantiate nodes
    sim_nodes: Dict[str, BaseSimNode] = {}
    for node in graph.nodes:
        if node.type == NodeType.source:
            d = SourceNodeData(**node.data)
            sim_nodes[node.id] = SourceNode(
                node_id=node.id,
                label=d.label,
                env=env,
                collector=collector,
                inter_arrival=d.inter_arrival,
                rng=rng,
                max_entities=d.max_entities,
                warmup_mode=warmup_mode,
                batch_size=d.batch_size,
            )
            collector.register_node(node.id, d.label, capacity=1, node_type="source")

        elif node.type == NodeType.process:
            d = ProcessNodeData(**node.data)
            # Resolve the assigned resource — treat missing/stale IDs as no resource
            # rather than silently running the process unconstrained.
            resolved_resource = None
            resolved_resource_id = None
            if d.resource_id and d.resource_id in resource_map:
                resolved_resource = simpy_resources[d.resource_id]
                resolved_resource_id = d.resource_id
            elif d.resource_id:
                # resource_id present but not in the resource list — surface as a
                # runtime error so the user knows something is misconfigured.
                raise ValueError(
                    f"Process node '{d.label}' references resource id '{d.resource_id}' "
                    f"which does not exist. Check that the resource hasn't been deleted."
                )
            # When a resource is assigned, always hold it for the full process
            # (the "load-only / automated machine" mode is not exposed in the UI).
            rpp = True if resolved_resource is not None else d.resource_performs_process

            # Resolve workcenter — silently ignore stale/missing IDs
            resolved_wc = None
            resolved_wc_id = None
            if d.workcenter_id and d.workcenter_id in simpy_workcenters:
                resolved_wc = simpy_workcenters[d.workcenter_id]
                resolved_wc_id = d.workcenter_id

            sim_nodes[node.id] = ProcessNode(
                node_id=node.id,
                label=d.label,
                env=env,
                collector=collector,
                duration=d.duration,
                capacity=d.capacity,
                rng=rng,
                resource=resolved_resource,
                resource_id=resolved_resource_id,
                resource_performs_process=rpp,
                travel_times=travel_lookup.get(resolved_resource_id, {}) if resolved_resource_id else {},
                batch_size=d.batch_size,
                min_batch_size=d.min_batch_size,
                priority=d.priority,
                max_infeed=d.max_infeed,
                max_outfeed=d.max_outfeed,
                fallout_rate=d.fallout_rate,
                workcenter=resolved_wc,
                workcenter_id=resolved_wc_id,
                workcenter_holds=workcenter_holds,
            )

        elif node.type == NodeType.sink:
            d = SinkNodeData(**node.data)
            sim_nodes[node.id] = SinkNode(
                node_id=node.id,
                label=d.label,
                env=env,
                collector=collector,
            )

        elif node.type == NodeType.storage:
            d = StorageNodeData(**node.data)
            sim_nodes[node.id] = StorageNode(
                node_id=node.id,
                label=d.label,
                env=env,
                collector=collector,
                max_capacity=d.max_capacity,
            )

    # Wire per-workcenter capacity events to every node so _downstream_capacity_events()
    # works correctly regardless of node type (SourceNode, StorageNode, etc.).
    for node in sim_nodes.values():
        node._wc_capacity_events = wc_capacity_events

    # Wire downstream connections
    for edge in graph.edges:
        src = sim_nodes.get(edge.source)
        tgt = sim_nodes.get(edge.target)
        if not (src and tgt):
            continue
        transport_resource = None
        transport_resource_id = None
        edge_travel_time = 0.0
        if edge.resource_id:
            if edge.resource_id not in simpy_resources:
                raise ValueError(
                    f"Edge '{edge.id}' references resource '{edge.resource_id}' "
                    f"which does not exist. Check that the resource hasn't been deleted."
                )
            transport_resource = simpy_resources[edge.resource_id]
            transport_resource_id = edge.resource_id
            edge_travel_time = (
                travel_lookup
                .get(edge.resource_id, {})
                .get(edge.source, {})
                .get(edge.target, 0.0)
            )
        src.downstream.append(DownstreamConnection(
            target=tgt,
            transport_resource=transport_resource,
            transport_resource_id=transport_resource_id,
            travel_time=edge_travel_time,
            transport_batch_size=edge.transport_batch_size,
            is_fallout=(edge.source_handle == "fallout-out"),
        ))

    return sim_nodes
