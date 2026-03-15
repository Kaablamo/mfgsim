# MfgSim — Testing Guide

This document explains the current test setup in MfgSim, how to run it, and how to extend it safely.

## Why Testing Matters Here

MfgSim is a simulation product, which means bugs are often silent. The application can still launch, run a model, and produce charts while returning the wrong throughput, the wrong utilization, or a deadlocked flow that should have progressed.

That makes testing especially important for:

- routing and blocking logic
- batch-start behavior
- shared workcenter behavior
- event logging
- validation rules
- launcher and shutdown behavior

The main goal of the current test suite is to catch regressions in simulation behavior before they become user-facing trust problems.

## Current Testing Strategy

The project currently uses a backend-first testing strategy.

Why backend-first:

- the highest-risk bugs are in the simulation engine
- backend logic is deterministic and easier to exercise in isolation
- frontend issues are important, but simulation correctness is the most critical product risk

The current suite is based on `pytest` and focuses on regression coverage for known failure modes.

## Current Test Files

- `backend/tests/helpers.py`
  Shared helpers for building small graphs and running the simulation engine synchronously in tests.
- `backend/tests/test_engine_regressions.py`
  Regression tests for deterministic throughput and batch pre-start staging behavior.
- `backend/tests/test_graph_validation.py`
  Validation tests for invalid graph configurations.
- `backend/tests/test_resource_naming.py`
  Tests for resource display-name behavior in logging and UI-facing payloads.

## Test Dependencies

Backend test dependencies are declared in:

- `backend/requirements-dev.txt`

That file currently installs:

- the normal backend runtime dependencies
- `pytest`

## Running the Tests

From the repository root:

```bash
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/pytest backend/tests -q
```

If you are not using the local `.venv`, activate your preferred Python environment first and then install `backend/requirements-dev.txt`.

## Developer Test Procedure

Use this as the default verification pass before opening a PR or packaging a release:

1. Install or refresh backend test dependencies.
2. Run the backend regression suite.
3. Run backend syntax verification.
4. Build the frontend bundle.
5. If you changed simulation behavior, add or update a regression test before finishing.

Typical command sequence:

```bash
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/pytest backend/tests -q
python3 -m compileall backend/app backend/entrypoint.py
cd frontend && npm run build
```

For targeted debugging, it is also fine to run a single test module or one named test first:

```bash
.venv/bin/pytest backend/tests/test_engine_regressions.py -q
.venv/bin/pytest backend/tests/test_engine_regressions.py -k batch -q
```

## Useful Verification Commands

These are not all unit tests, but they are useful as part of a normal verification pass:

```bash
.venv/bin/pytest backend/tests -q
python3 -m compileall backend/app backend/entrypoint.py
cd frontend && npm run build
```

What each one does:

- `pytest`
  Runs the backend regression suite.
- `compileall`
  Catches Python syntax/import issues in the backend.
- `npm run build`
  Catches TypeScript and frontend bundling issues.

## How the Backend Test Harness Works

The most important helper is `run_engine_sync(...)` in `backend/tests/helpers.py`.

It does three useful things:

1. Builds a real `SimulationEngine`
2. Replaces websocket broadcasting with a local payload collector
3. Runs the engine synchronously so the test can inspect emitted `status`, `tick`, `summary`, and `event_log` payloads

That means the current tests are not mock-heavy. They exercise a real path through:

- graph models
- graph builder
- simulation nodes
- collector
- emitted payload serialization

This gives better protection than tiny isolated tests alone.

## Writing a New Regression Test

The normal pattern is:

1. Create a very small graph inline
2. Run it with deterministic settings
3. Assert the behavior you care about

Example shape:

```python
def test_example_behavior():
    graph = make_graph(
        nodes=[...],
        edges=[...],
    )

    payloads = run_engine_sync(graph, config=SimConfigModel(duration=10, tick_interval=1))
    summary = first_payload(payloads, "summary")

    assert summary["total_throughput"] == 3
```

## Test Design Guidelines

Prefer these patterns:

- use the smallest graph that reproduces the behavior
- use fixed distributions where possible
- use explicit durations and capacities
- assert outcomes that matter to users: throughput, completion count, deadlock prevention, validation messages
- write a regression test whenever you fix a real bug from a customer or internal model

Avoid these patterns:

- asserting large amounts of incidental payload data
- relying on fragile timing details unless timing is the behavior under test
- writing broad “coverage-only” tests with weak assertions

## Determinism

Simulation tests should be deterministic whenever possible.

Prefer:

- fixed distributions
- explicit graph topology
- explicit simulation duration
- explicit batch sizes and capacities
- fixed RNG seeds when randomness is required

This keeps failures meaningful and repeatable.

## What To Add Next

The next high-value tests for this project are:

- shared workcenter deadlock regressions
- storage wake-up regressions
- API integration tests for `run`, `stop`, `status`, `validate`, `health`, and `shutdown`
- `.mfgsim` payload roundtrip tests
- frontend tests for sidebar selection and autosave behavior

## Frontend Testing

The project does not yet have a frontend test runner configured.

When frontend coverage is added, the recommended order is:

1. component/state tests for sidebar selection and autosave behavior
2. event log filter/display tests
3. one or two end-to-end smoke tests for load → run → results

Backend regression coverage should remain the priority because that is where the product’s numerical credibility is most exposed.

## When To Add a Test

Add a test when:

- a real user model exposed a bug
- a routing or batching rule changes
- validation rules change
- a launch/shutdown lifecycle rule changes
- a log/event semantic changes

If a bug was expensive to understand once, it should usually become a permanent regression test.
