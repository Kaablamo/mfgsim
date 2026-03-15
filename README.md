# MfgSim — Manufacturing Process Simulation Software

MfgSim is a discrete-event process simulation tool for manufacturing engineers. It helps teams define a production system, estimate throughput, understand resource utilization, and test process changes before investing in hardware.

## License

This repository is licensed under Apache-2.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party software notices.

## Quick Start (Development)

### Prerequisites
- Python 3.9+
- Node.js 18+

### 1. Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

Or use the helper script for your platform:

- Windows: `scripts\dev.bat`
- macOS/Linux: `bash scripts/dev.sh`

If you are setting up on macOS/Linux for the first time:

```bash
bash scripts/setup_mac.sh
```

---

## Building the Executable

```bat
scripts\build_all.bat
```

Output: `dist\MfgSim.exe` — a single self-contained Windows executable.

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime flow, simulation lifecycle, and extension points.
See [docs/testing.md](docs/testing.md) for the developer test workflow and current test coverage.

```
mfg-sim/
├── backend/          Python (FastAPI + SimPy)
│   ├── app/
│   │   ├── api/      REST routes + WebSocket
│   │   ├── models/   Pydantic schemas
│   │   ├── simulation/  SimPy engine, nodes, distributions
│   │   └── persistence/ .mfgsim file read/write
│   └── entrypoint.py   PyInstaller entry
│
├── frontend/         React (Vite + ReactFlow + Recharts)
│   └── src/
│       ├── store/    Zustand state (graph, sim, resources)
│       ├── components/
│       │   ├── NodeEditor/   Drag-and-drop model builder
│       │   ├── Sidebar/      Node configuration panels
│       │   ├── Dashboard/    Live charts and summary
│       │   ├── Resources/    Resource definition UI
│       │   └── SimControls/  Run/Stop/Save/Load toolbar
│       └── hooks/    WebSocket + API hooks
│
└── scripts/
    ├── dev.bat       Start both servers for development
    └── build_all.bat Build production .exe
```

## Node Types
| Node | Purpose |
|---|---|
| **Source** | Generates entities at a configurable arrival rate |
| **Storage** | Acts as a buffer between steps, with optional capacity limits to model intermediate WIP |
| **Process** | Represents an operation with configurable processing time, distributions, and WIP allowance |
| **Sink** | Collects and counts completed entities |

## Process Nodes (Additional Info)
Process nodes represent value-added manufacturing steps such as machining, inspection, washing, assembly, testing, or packaging. They are the main place where time, capacity, and resource constraints are applied in the model.

Process nodes can define:
- Processing time using a supported distribution
- Batch size and minimum start quantity
- Infeed and outfeed WIP limits
- Routing priority
- Fallout or failed-part behavior
- Assigned resources
- Assigned work centers

Use process nodes when you want the simulation to explicitly model queueing, active processing, blocking, shared labor or equipment, and the effect those constraints have on throughput.

## Supported Time Distributions
| Distribution | Parameters | Typical use |
|---|---|---|
| **Fixed** | Value | Deterministic cycle time (ideal / theoretical) |
| **Normal** | Mean, Std Dev | Cycle times that cluster around an average with symmetric spread |
| **Lognormal** | Mean, Std Dev | Cycle times with a long right tail (most fast, occasional slow) |
| **Exponential** | Scale (mean) | Time between random arrivals; memoryless |
| **Uniform** | Low, High | Equal probability anywhere in a range |
| **Triangular** | Low, Mode, High | When you know the min, most-likely, and max |
| **Weibull** | Scale, Shape | Failure/wear modelling; flexible shape |
| **Poisson** | Mean | Discrete count of events per interval |

## Resources
Resources are shared capacity pools used by stations or transport paths. They are a good fit for operators, forklifts, robots, fixtures, or any other limited asset that multiple parts compete for.

Each resource has:
- Quantity
- Movement time (Routing)
- A display name
- Utilization tracking during the run

Resources can be assigned to:
- Process nodes, where the resource participates in processing
- Edges, where the resource transports parts between nodes

When multiple stations or routes need the same resource, the simulation will queue work and expose that contention in utilization, waiting time, and event log output.

## Work Centers
Work centers represent shared physical capacity across multiple process nodes. Use them when several steps happen in the same cell, nest, robot envelope, or machine grouping and should compete for the same active slot count.

Each work center has:
- A name
- A capacity

Assigning the same work center to multiple process nodes lets the simulation model a constrained physical area without forcing you to merge those steps into one giant process node.

### Resources vs Work Centers
Resources and Work Centers solve different modeling problems.

A Resource represents something that performs work or moves parts. Typical examples are operators, robots, forklifts, fixtures, or carts. Resources are best used when multiple stations or routes must compete for the same labor or equipment.

A Work Center represents shared physical processing capacity across multiple process nodes. Typical examples are a robot cell, a test nest area, a wash station frame, or a machine with multiple modeled steps inside the same physical envelope.

A simple rule of thumb:
- Use a Resource when you are modeling who or what is needed to do the work.
- Use a Work Center when you are modeling how many active jobs the physical area can support at once.

Example:
- An Operator with quantity 2 is a Resource.
- A Robot Cell with capacity 1 is a Work Center.
- Two process nodes inside that cell can share the same Work Center so they cannot both run at the same time, even if they use different resources.

## Dashboard Tab
The Dashboard tab is the main readout during and after a run. It combines live charts with end-of-run summaries so you can quickly understand where the model is spending time.

The dashboard currently shows:
- WIP over time
- Resource utilization
- Process queue lengths
- Process utilization
- Storage throughput
- A per-node summary table after the run finishes

This is usually the first place to look for bottlenecks, starvation, blocked flow, or underutilized resources.

## Routing Tab
The Routing tab manages travel times for resource-driven movement between nodes. It is only relevant when an edge has a transport resource assigned.

Use it to define:
- How long a resource takes to move from one node to another
- Whether those times should be mirrored symmetrically

This tab is most useful when the same transport resource serves multiple routes and travel time affects throughput or utilization.

MfgSim also tracks the current location of a resource as it moves through the model. When a resource is reused for a later step, the simulation accounts for the travel time from its last location to the next assigned process or transport. That travel shows up in the event log and is included in resource utilization, so heavily shared movers reflect both working time and time spent in transit. For this reason it is important to model and input all possible routing times for each resource.

## Log Tab
The Log tab provides a chronological event stream for the run. It is the best place to debug why parts stalled, why a resource stayed busy, or why a station never started.

The log includes:
- Part creation and queueing
- Process start and end events
- Transport start and end events
- Completions
- Resource-related activity

You can filter the log by part, node, resource, and event type, then export the current filtered view to CSV for deeper analysis.

## Saving and Loading Models
MfgSim saves models as `.mfgsim` files. The file is JSON-based, but it is intended to be managed through the application rather than edited by hand.

Node and edge property changes are applied to the current in-browser model automatically as you edit. This includes Process nodes as well as Source, Storage, Sink, and edge settings. There is no separate Apply step in the editor. Use the toolbar Save button when you want to write that current model state to a `.mfgsim` file on disk.

Each saved model includes:
- Graph nodes and edges
- Node positions on the canvas
- Node and edge configuration
- Resources
- Work centers
- Parts
- Simulation settings
- Travel-time mappings
- Basic metadata such as project name and modified timestamp
