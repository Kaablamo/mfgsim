# MfgSim — Getting Started

## What Is MfgSim?

MfgSim is a discrete-event simulation tool for manufacturing and process flow analysis. You build a diagram of your production system: sources that create parts, processes that work on them, and sinks that consume them. The simulator runs time forward to show you how the system behaves under load. It answers questions like:

- Where does WIP accumulate?
- Which station is the bottleneck?
- What happens to throughput if I add a second operator?
- How does a 4% fallout rate at one station affect overall cycle time?

## Using the Packaged App
The packaged Windows application runs as a local server plus a browser-based interface.

When you launch MfgSim.exe, the application checks whether the local MfgSim server is already running:
- If it is already running, MfgSim opens the browser to the existing session.
- If it is not running, MfgSim starts the local server and then opens the browser.

The browser is the main user interface. Closing the browser does not automatically stop the local server. To fully shut down the packaged app:
- Use the shutdown option in the Settings menu inside MfgSim.
- Or terminate the process externally, such as through Task Manager.

## The Interface

```
┌────────────────────────────────────────────────────────────────────┐
│  MfgSim   [Project Name]   💾  📂  ⚙  ▶ Run                        │  ← Top bar
├────────────────────────────────────────────────────────────────────┤
│  Model Editor │ Dashboard │ Routing │ Log                          │  ← Tabs
├──────────────┬─────────────────────────────────────┬───────────────┤
│ Resources    │                                     │               │
│ Parts        │         Canvas (node editor)        │  Properties   │
│ Nodes        │                                     │  panel        │
│ WorkCenters  │                                     │               │
└──────────────┴─────────────────────────────────────┴───────────────┘
```

- **Left panel** — Library tabs: Resources, Parts, Nodes
- **Canvas** — Where you build your flow diagram
- **Properties panel** — Appears when you click a node or edge
- **Property changes** — Node and edge edits are saved to the current model automatically as you make them, including Process node settings
- **Top tabs** — Switch between Model Editor, Dashboard (live metrics), Routing (travel times), and Log (event log)

## Building Your First Model

### Step 1 — Add a Source

Left-click **Add Source** button above the canvas, or drag one in from the Nodes panel. A Source generates parts at a configurable rate. Click it to open the Properties panel:

- **Name** — Label shown on the canvas.
- **Entity Type** — A name for the part being generated (legacy label; use the Parts tab for full part management).
- **Inter-Arrival Time** — How often a new part is released. A fixed value of `10` means one part every 10 time units. See [distributions](#distributions) for stochastic options.
- **Batch Size** — Parts released per interval. `1` = single-piece flow.
- **Max Entities** — Optional cap on total parts. Leave blank for unlimited (runs for the full simulation duration).

Changes in the Properties panel are saved to the current model automatically as you edit.

### Step 2 — Add Processes

Add one or more **Process** nodes between the Source and a Sink. Each Process represents a workstation. At minimum, configure:

- **Name** — What is this station called?
- **Processing Time** — How long does it take to process one part (or one batch)?

Process node changes are saved to the current model immediately as you edit. There is no separate Apply step.

### Step 3 — Add a Sink

Every flow needs an endpoint. A **Sink** node absorbs completed parts and records their cycle time. Give it a name (e.g. "Finished Goods").

### Step 4 — Connect the Nodes

Click the output handle (right side) of the Source and drag to the input handle (left side) of your first Process. Continue connecting nodes in sequence until you reach the Sink.

> **Tip:** The canvas auto-arranges handles. The dot on the right is an output; the dot on the left is an input. The red dot at the bottom (if visible) is the fallout/rework output.

### Step 5 — Run the Simulation

Click **▶ Run** in the top bar. The simulation runs and the **Dashboard** tab updates live with queue lengths, utilization, and throughput. When it finishes, a summary appears.

---

## Adding Resources

Resources represent people or machines that are shared across the system — operators, robots, forklifts. They add contention: if you have one operator and two stations both need them, one station must wait.

1. Open the **Resources** tab (left panel).
2. Click **+ Add** and give the resource a name and quantity.
   - *Quantity* = how many instances exist. An operator pool of 2 gives you Operator 1 and Operator 2, both available simultaneously.
3. Assign to a **Process node** (station operates it), or to an **Edge** (transports parts between nodes).

### Assigning to a Process

Open the Properties panel for a Process node → **Resource Assignment** → select from the dropdown. The resource is held for the full processing duration and released when done.

### Assigning to an Edge (Transport)

Click an edge (connection between nodes) → select a **Transport Resource** and optionally set a **Batch Size** (parts carried per trip). Configure travel times in the **Routing** tab.

### Transport Behavior Without a Resource
Transport time is only modeled when an edge has a transport resource assigned.

If an edge does not use a transport resource, the transfer is treated as immediate. The part still respects downstream queue limits, infeed limits, and blocking rules, but no separate travel delay or transport-resource utilization is added.

Use a transport resource when movement itself is a constraint that should affect throughput, queueing, or utilization.

## Configuring Travel Times

If you've assigned a transport resource to edges, use the **Routing** tab to set how long each trip takes.

1. Select the resource from the dropdown.
2. The matrix shows every combination of From → To nodes.
3. Enter travel times in simulation time units.
4. Toggle **Symmetric** to fill both directions at once.

---

## Saving and Loading Models

Models are saved as `.mfgsim` files (JSON format). Use the **💾** and **📂** buttons in the top bar. A saved file includes the graph layout, all configurations, resources, parts, travel times, and simulation settings.

Node and edge edits are applied to the current in-browser model automatically. Use **💾** when you want to write the current model to disk as a `.mfgsim` file.

### What Is Saved in a Model File
A .mfgsim file stores the model configuration needed to reopen and rerun a project.

Saved data includes:
- Graph nodes and edges
- Node positions on the canvas
- Node, edge, resource, part, and work center settings
- Travel-time mappings
- Simulation settings
- Basic metadata such as project name and modified timestamp

A model file does not currently store:
- Autosaved in-progress changes outside the downloaded file
- Run results from previous simulations
- Event log CSV exports
- Server-side project history or versioning

If you want to preserve results from a run, export them separately.

If you are working on MfgSim itself rather than just using it, see [Testing Guide](testing.md) for the current developer verification workflow.

## Simulation Settings

Click the **⚙** icon to configure the run:

| Setting | What it does |
|---|---|
| Duration | Total simulation time in your chosen time units: minutes, seconds, cycles, and so on. |
| Warmup Period | Time at the start where the system runs but stats are not collected. Use this to fill the pipeline before measuring. |
| RNG Seed | Fixed seed for reproducibility. Same seed plus same model gives identical results every run. Set to `0` for a random seed each time. |
| Tick Interval | How often the Dashboard refreshes during a run. Smaller means more updates and slightly slower execution. |

## Reading the Dashboard

After a run, the Dashboard shows per-node metrics:

| Metric | Definition |
|---|---|
| Queue Length | Parts waiting to be processed at end of run |
| Utilization | Percent of time the station was actively processing |
| Throughput | Parts completed at this station over the run |
| Avg Cycle Time | Average time from a part first entering the system to completing |

Resource utilization is also shown — a resource near 100% is a constraint.


## The Event Log

The **Log** tab shows every event that occurred during the run in chronological order.

- **Filter** by part number, resource, node, or event type.
- **Export CSV** downloads all filtered events.

This is especially useful for tracing why a specific part was delayed, or verifying that a rework loop is behaving correctly.

---

## Parts (Optional)

The **Parts** tab lets you define a library of named parts (with optional part numbers). Once defined, you can assign:

- An **Output Part** to each Source (what part type it generates).
- **Input Parts** and an **Output Part** to each Process (what it consumes and produces).

This is documentation-only in the current version — the simulation runs identically whether parts are assigned or not. Part names appear as badges on canvas nodes and in the event log. This lays the groundwork for assembly modeling in a future release.

---

## Time Units

MfgSim is unitless — you decide what one time unit represents. If your cycle times are in seconds, your simulation duration should also be in seconds. Common choices:

- **Seconds** — good for fast automated processes
- **Minutes** — good for manual assembly lines
- **Hours** — good for job shop or batch manufacturing

Be consistent throughout your model.

---

## Common Mistakes
| Symptom | Likely cause |
|---|---|
| All parts pile up at the first process | Inter-arrival time is much shorter than processing time. This is normal if that station is the bottleneck. |
| Simulation finishes instantly with no completions | Simulation duration is too short, or the Source has `Max Entities = 0`. |
| Resource utilization shows 0% | A resource is assigned but travel times are `0` and no queuing contention occurs. This can be normal for light load. |
| Parts stuck in outfeed buffer | The next node's infeed is full or the downstream station is blocked. |
| Simulation throws a "resource not found" error | A resource was deleted after being assigned to a node or edge. Reassign it or remove the reference. |
