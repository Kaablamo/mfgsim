from __future__ import annotations

from app.simulation.collector import ResourceAccumulator


def test_single_quantity_resource_omits_numeric_suffix() -> None:
    resource = ResourceAccumulator(resource_id="op", name="Operator", quantity=1)

    instance_id = resource.on_acquire(0.0)

    assert instance_id == 1
    assert resource.log_instance(instance_id) is None
    assert resource.display_name(instance_id) == "Operator"


def test_multi_quantity_resource_keeps_instance_suffix() -> None:
    resource = ResourceAccumulator(resource_id="op", name="Operator", quantity=2)

    instance_id = resource.on_acquire(0.0)

    assert instance_id == 1
    assert resource.log_instance(instance_id) == 1
    assert resource.display_name(instance_id) == "Operator 1"
