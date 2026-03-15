from __future__ import annotations
from typing import List
from fastapi import APIRouter
from pydantic import BaseModel

from app.models.graph_models import GraphModel, NodeType, ProcessNodeData

router = APIRouter(prefix="/api/graph")


class ValidationError(BaseModel):
    node_id: str
    message: str


class ValidationResult(BaseModel):
    valid: bool
    errors: List[ValidationError]


@router.post("/validate", response_model=ValidationResult)
async def validate_graph(graph: GraphModel) -> ValidationResult:
    errors: list[ValidationError] = []

    # 1. Must have at least one source and one sink
    sources = [n for n in graph.nodes if n.type == NodeType.source]
    sinks = [n for n in graph.nodes if n.type == NodeType.sink]
    if not sources:
        errors.append(ValidationError(node_id="__graph__", message="Graph must have at least one Source node."))
    if not sinks:
        errors.append(ValidationError(node_id="__graph__", message="Graph must have at least one Sink node."))

    # Build adjacency
    outbound: dict[str, list[str]] = {n.id: [] for n in graph.nodes}
    inbound: dict[str, list[str]] = {n.id: [] for n in graph.nodes}
    inbound_batch_sizes: dict[str, list[int]] = {n.id: [] for n in graph.nodes}
    for edge in graph.edges:
        if edge.source in outbound:
            outbound[edge.source].append(edge.target)
        if edge.target in inbound:
            inbound[edge.target].append(edge.source)
            inbound_batch_sizes[edge.target].append(
                edge.transport_batch_size if edge.resource_id and edge.transport_batch_size > 1 else 1
            )

    for node in graph.nodes:
        nid = node.id
        # 2. Non-sink nodes must have outbound edges
        if node.type != NodeType.sink and not outbound[nid]:
            errors.append(ValidationError(node_id=nid, message=f'"{node.data.get("label", nid)}" has no outbound connections.'))
        # 3. Non-source nodes must have inbound edges
        if node.type != NodeType.source and not inbound[nid]:
            errors.append(ValidationError(node_id=nid, message=f'"{node.data.get("label", nid)}" has no inbound connections.'))

        # 3a. Process-specific configuration validation
        if node.type == NodeType.process:
            data = ProcessNodeData(**node.data)
            label = data.label or nid

            if data.min_batch_size > data.batch_size:
                errors.append(ValidationError(
                    node_id=nid,
                    message=(
                        f'"{label}" has Min. Start Quantity {data.min_batch_size} '
                        f'greater than Batch Size {data.batch_size}.'
                    ),
                ))

            if data.max_infeed is not None:
                delivery_sizes = sorted(set(inbound_batch_sizes.get(nid) or [1]))
                start_limit = 1 if data.max_infeed == 0 else data.max_infeed
                if data.batch_size > 1 or data.min_batch_size > 1:
                    start_limit = max(start_limit, data.min_batch_size)
                reachable_queue_sizes = {0}
                frontier = [0]

                # A delivery may start only while the node is still below its
                # routing cap. Once started, the whole atomic delivery arrives.
                while frontier:
                    current_queue = frontier.pop()
                    if current_queue >= start_limit:
                        continue
                    for delivery_size in delivery_sizes:
                        next_queue = current_queue + delivery_size
                        if next_queue not in reachable_queue_sizes:
                            reachable_queue_sizes.add(next_queue)
                            frontier.append(next_queue)

                max_startable_batch = max(reachable_queue_sizes)
                max_atomic_arrival = max(delivery_sizes)

                if data.min_batch_size > max_startable_batch:
                    if data.max_infeed == 0 and start_limit == 1:
                        detail = (
                            'No infeed WIP is enabled, and the largest inbound '
                            f'transport batch is {max_atomic_arrival}'
                        )
                    elif data.max_infeed == 0:
                        detail = (
                            'No infeed WIP is enabled, so this station can only rely on '
                            f'pre-start staging up to Min. Start Quantity {data.min_batch_size}. '
                            f'The largest inbound transport batch is {max_atomic_arrival}'
                        )
                    else:
                        detail = (
                            f'Infeed Qty is {data.max_infeed}, pre-start staging is limited '
                            f'to Min. Start Quantity {data.min_batch_size}, and the largest inbound '
                            f'transport batch is {max_atomic_arrival}'
                        )
                    errors.append(ValidationError(
                        node_id=nid,
                        message=(
                            f'"{label}" can never start a batch: Min. Start Quantity '
                            f'{data.min_batch_size} exceeds the largest reachable pre-start '
                            f'queue of {max_startable_batch}. {detail}.'
                        ),
                    ))

    # 4. Reachability: every source must reach at least one sink (BFS)
    sink_ids = {n.id for n in sinks}
    for src in sources:
        visited: set[str] = set()
        queue = [src.id]
        reached_sink = False
        while queue:
            cur = queue.pop()
            if cur in visited:
                continue
            visited.add(cur)
            if cur in sink_ids:
                reached_sink = True
                break
            queue.extend(outbound.get(cur, []))
        if not reached_sink:
            errors.append(ValidationError(
                node_id=src.id,
                message=f'Source "{src.data.get("label", src.id)}" cannot reach any Sink node.'
            ))

    return ValidationResult(valid=len(errors) == 0, errors=errors)
