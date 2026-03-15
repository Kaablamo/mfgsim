# Architecture

This document describes how MfgSim is structured today, how a simulation
moves through the stack, and where to make changes safely.

## Architecture Flow Summary

A typical simulation run moves through the system in this order:
1. The frontend collects the current model from the browser state.
2. The frontend validates the graph through the backend API.
3. If validation passes, the frontend sends a run request to the backend.
4. The backend builds a live SimPy model from the saved graph data.
5. The simulation engine advances the model and collects metrics and events.
6. The backend streams status updates, ticks, and final results over the websocket.
7. The frontend updates the Dashboard and Log tabs from those live messages.

This separation keeps model editing in the browser, simulation execution in Python, and live monitoring in the websocket-driven UI.

## Design Intent

MfgSim is a local-first manufacturing process simulation tool:
- the frontend is a browser UI for building and running models
- the backend hosts the API, websocket stream, and packaged desktop runtime
- the simulation core is a SimPy model assembled from the saved graph

The codebase is optimized for workstation use, not cloud hosting.

Only one simulation run is active at a time.

## High-Level Runtime

### Development

1. Vite serves the frontend on `:5173`.
2. FastAPI serves the backend on `:8765`.
3. Frontend API and websocket calls use same-origin `/api` and `/ws` during dev,
   with Vite proxying those requests to the backend.

### Packaged Windows App

1. `MfgSim.exe` starts in launcher mode.
2. The launcher checks `GET /api/system/health` on `127.0.0.1:8765`.
3. If the local server is already up, it opens the browser and exits.
4. Otherwise it starts a detached background server, waits for health, opens the browser, and exits.
5. The running server stays alive until the user shuts it down from the UI or terminates it externally.

Relevant files:

- `backend/entrypoint.py`
- `backend/mfg_sim.spec`
- `backend/app/api/routes/system.py`

## Repository Layout

### Backend

- `backend/app/main.py`
  Creates the FastAPI app, registers routes, configures CORS, and serves the built frontend in packaged mode.
- `backend/app/api/routes/`
  REST API endpoints for simulation control, graph validation, and local system lifecycle.
- `backend/app/api/websockets/`
  Websocket endpoint and connection manager used for live simulation updates.
- `backend/app/models/`
  Pydantic models for graph data, resources, workcenters, simulation config, and websocket payloads.
- `backend/app/simulation/`
  SimPy engine, graph builder, node implementations, event logging, and statistics collection.
- `backend/app/persistence/`
  File-format helpers for saved model payloads.

### Frontend

- `frontend/src/App.tsx`
  Main shell for the editor, dashboard, routing, and log tabs.
- `frontend/src/store/`
  Zustand stores for graph structure, resources, workcenters, parts, travel times, and simulation state.
- `frontend/src/hooks/useSimApi.ts`
  HTTP API bridge for run, stop, validate, and shutdown actions.
- `frontend/src/hooks/useSimWebSocket.ts`
  Live websocket client that feeds ticks, summary data, and event logs into the stores.
- `frontend/src/components/`
  Model editor, node configuration panels, dashboard, event log, resource/workcenter editors, and run controls.

## Backend Flow

### FastAPI App

`backend/app/main.py` builds the application and registers four main surfaces:

- `POST /api/sim/run`
- `POST /api/sim/stop`
- `GET /api/sim/status`
- `POST /api/graph/validate`
- `GET /api/system/health`
- `POST /api/system/shutdown`
- `GET /ws/simulation`

There is no database. All run state lives in memory.

### Simulation Control

`backend/app/api/routes/simulation.py` owns the current engine instance:

- starting a run stops any existing engine
- the new run receives a generated `run_id`
- the engine is started in a background thread
- stop requests address the active run by `run_id`

`backend/app/api/routes/system.py` is deliberately separate from simulation control:

- `health` is used by the desktop launcher
- `shutdown` stops the active engine and asks the local server process to exit

### Websocket Broadcast Path

`backend/app/api/websockets/manager.py` holds active websocket connections.
`SimulationEngine` serializes payloads and schedules broadcasts back onto the
FastAPI event loop from its worker thread.

The websocket is write-heavy and server-driven:

- the browser mostly listens
- the only client-originating message currently handled is a simple ping

## Simulation Core

### Engine Lifecycle

`backend/app/simulation/engine.py` is the orchestrator for a run:

1. create RNG, collector, and SimPy environment
2. call `build_graph(...)`
3. identify source nodes
4. optionally run warm-up mode
5. run the main timed simulation loop
6. emit tick payloads at the configured interval
7. stop new arrivals and drain in-flight entities
8. emit summary and event log payloads
9. emit final `stopped` status

The engine thread owns the SimPy environment. The FastAPI thread never mutates
simulation state directly.

### Graph Builder

`backend/app/simulation/graph_builder.py` translates the saved graph into live objects:

- instantiates shared SimPy resources from resource definitions
- instantiates shared SimPy resources for workcenters
- builds travel-time lookup tables for resource-driven movement
- creates node objects for each source, process, storage, and sink
- wires downstream connections from graph edges

This is the boundary between saved model data and executable simulation objects.

### Node Model

All executable nodes derive from `BaseSimNode` in
`backend/app/simulation/nodes/base_node.py`.

Shared responsibilities:

- hold downstream connections
- choose a downstream route
- reserve pending arrivals before travel completes
- defer routing when downstream capacity is blocked
- wake blocked upstream nodes when capacity becomes available

Concrete node types:

- `SourceNode`
  Generates entities according to inter-arrival configuration and optional batching.
- `ProcessNode`
  Handles single-piece or batch processing, shared resources, workcenters, infeed/outfeed logic, and fallout routing.
- `StorageNode`
  Acts as pass-through staging with optional capacity back-pressure.
- `SinkNode`
  Marks completion and records final cycle time.

### Routing and Back-Pressure

The routing model is more than a simple queue-length comparison. The important rules live in:

- `backend/app/simulation/nodes/base_node.py`
- `backend/app/simulation/nodes/process_node.py`
- `backend/app/simulation/nodes/storage_node.py`

Important concepts:

- `pending arrivals`
  Parts already committed to a destination but still in transit count against its effective queue.
- `infeed limits`
  Routing respects station queue constraints before parts arrive.
- `workcenters`
  Multiple process nodes can share a physical capacity pool across a chain of steps.
- `deferred routing`
  If all downstream paths are blocked, the entity waits upstream on capacity events instead of being forced into an invalid queue.
- `batch pre-start staging`
  Idle batch nodes can temporarily accept enough staged WIP to reach `min_batch_size`, even if the normal steady-state infeed cap is tighter.

### Metrics and Event Logging

`backend/app/simulation/collector.py` tracks:

- per-node queue length and in-process counts
- node utilization and throughput
- resource utilization
- summary metrics at the end of the run
- event log records used by the frontend log view and CSV export

The collector is the source of truth for dashboard and log output.

## Frontend Flow

### State Management

The frontend uses several small Zustand stores instead of one global store:

- `graphStore`
  Canvas nodes, edges, selection, import/export
- `resourceStore`
  Shared resource definitions
- `workcenterStore`
  Workcenter definitions
- `partStore`
  Part metadata used for modeling
- `travelStore`
  Resource travel-time matrix
- `simStore`
  Run config, live metrics, summary, event log, and shutdown state

### Run Lifecycle in the UI

1. The user clicks `Run` in `SimControls`.
2. The frontend validates the graph with `POST /api/graph/validate`.
3. If valid, it submits the run payload with `POST /api/sim/run`.
4. `useSimWebSocket` receives status and tick messages.
5. `simStore` updates live dashboard state.
6. When the run ends, the frontend receives summary and event log payloads.

### Save and Load

The `.mfgsim` file is a JSON document assembled in the browser:

- graph
- resources
- parts
- workcenters
- simulation config
- travel times
- basic metadata such as project name and modified timestamp

Node and edge edits are applied to the in-browser model immediately through the frontend stores. All sidebar editors now write directly into that shared browser state, so there is no staged Apply step for Process or other node configuration. The explicit Save action in `SimControls` is what serializes that current browser state into a downloadable `.mfgsim` file.

The backend does not currently persist project files server-side.

### Main UI Surfaces

- `NodeEditor`
  Graph canvas for sources, processes, storage, sinks, and edge wiring.
- `Sidebar`
  Per-node and per-edge configuration forms.
- `Dashboard`
  Live charts and end-of-run summary tables.
- `EventLog`
  Filterable run log plus CSV export.
- `SimControls`
  Save/load, run/stop, simulation settings, and explicit application shutdown.

## Desktop Shutdown Model

The packaged app intentionally does not use a tray icon.

Instead:

- the user launches the app from the executable
- the browser opens against the local server
- the user can shut the server down from the settings modal
- if the user closes the browser but leaves the server running, launching the executable again simply reopens the page

This model keeps the desktop packaging lightweight and avoids a second UI surface for basic lifecycle control.

## Extension Points

### Add a New Node Type

You will need to touch at least:

- frontend graph types
- frontend node component and config form
- graph store export/import path if new fields are added
- backend graph models
- `graph_builder.py`
- a new concrete simulation node class
- validation rules in `api/routes/graph.py`
- dashboard and log presentation if the node has new runtime metrics

### Add a New Live Metric

Typical path:

- add collector support
- expose the metric on the websocket payload model
- update `useSimWebSocket`
- render it in the dashboard or log

### Change Desktop Launch Behavior

Relevant files:

- `backend/entrypoint.py`
- `backend/app/api/routes/system.py`
- `backend/app/main.py`
- `backend/mfg_sim.spec`

## Current Constraints

- single-process local deployment
- one active run at a time
- no server-side project storage
- no authentication or multi-user session model
- no attempt to simulate physical robot motion or collision geometry

That boundary is intentional. The product is aimed at throughput, utilization,
queueing, and bottleneck analysis rather than controls-level behavior.
