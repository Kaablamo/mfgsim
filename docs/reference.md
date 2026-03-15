# MfgSim — Configuration Reference

This document describes every configurable option in MfgSim, how each one works, and how options interact with each other.

## Scope Note

MfgSim is designed to estimate throughput, queueing, utilization, and bottlenecks in a manufacturing system. It does not attempt to model robot motion paths, PLC logic, collision geometry, or controls-level execution details. Those details should be represented only when they materially affect capacity, blocking, or flow.

## Editor Save Behavior

Node and edge property changes are written to the current in-browser model automatically as you edit. This applies to all node types, including Process nodes, as well as edges. There is no separate Apply step in the editor. This is separate from saving a file to disk. Use the main toolbar Save action when you want to export the current model as a `.mfgsim` file.

## Distributions

Many fields accept a statistical distribution instead of a fixed value. This models the natural variability in real processes.

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

> The distribution chart in the expanded Properties panel (hover over the panel edge to expand) shows the shape in real time as you adjust parameters.

## Source Node

A Source generates entities (parts) and injects them into the system.

### Name
Display label on the canvas. No functional effect.

### Entity Type
A short text tag attached to generated parts (e.g. "Casting", "Housing"). This is a legacy label field; for full part tracking use the **Parts** tab instead. If both are set, the Parts assignment takes precedence visually.

### Inter-Arrival Time
The time between successive part releases. With **Batch Size = 1**, this is the gap between individual parts. With **Batch Size > 1**, this is the gap between bursts.

- A shorter inter-arrival time = higher production rate.
- If inter-arrival time < total system throughput time, WIP will accumulate.

### Batch Size
How many parts are released at each inter-arrival event.

- `1` = single-piece flow (default).
- `4` = four parts released simultaneously every inter-arrival interval.

This affects the overall arrival rate (parts/time = batch_size / inter_arrival).

### Max Entities
Total parts this source will ever generate. Once reached, the source stops.

- Leave blank for unlimited — the source runs for the full simulation duration.
- Useful for modeling a finite order quantity or a fixed production run.

### Output Part *(requires Parts library)*
Which part type this source produces. Cosmetic in Phase 1; used for visual documentation and future assembly modeling.

## Process Node

A Process represents a workstation, machine, or operation.

### Name
Display label on the canvas. Also appears in Dashboard metrics and the Event Log.

### Routing Priority

Controls which station an upstream node feeds first when multiple downstream options exist.

| Priority | Behaviour |
|---|---|
| **Bottleneck** | Always fed first. Use on your identified bottleneck to ensure it never starves. |
| **High** | Fed before Medium and Low stations. |
| **Medium** | Standard routing (default). |
| **Low** | Fed only after all higher-priority stations have been satisfied. |

**How the routing algorithm works:**

Every time a part finishes at a node and needs to move downstream, the algorithm scores each eligible downstream station:

1. **State score** (highest urgency wins):
   - *Idle* (2) — below minimum batch size, nothing processing. Needs parts most urgently.
   - *Filling* (1) — batch is running but not yet full. A good secondary target.
   - *Funded* (0) — queue already at or above min batch size. Don't over-fill.
   - *Full* (-1) — infeed limit reached or storage at capacity. Skip entirely.

2. **Priority score** — your configured priority value (bottleneck=3, high=2, medium=1, low=0).

3. **Fill depth** — among equal-state-and-priority stations, prefer the one already closest to its batch threshold (consolidates work rather than spreading it thin).

4. **Node ID** (deterministic tiebreak) — lower node ID wins when all else is equal. Prevents arbitrary splitting.

A station with priority **Bottleneck** in state *Funded* still beats a *Medium* station in state *Idle*. Priority always outweighs state.

### Resource Assignment

Assigns a resource (operator, robot, etc.) to this station. The resource is held for the full processing duration and released when done.

- **None** — automated / no operator required.
- If the assigned resource is busy (all instances occupied), the station waits before starting.

> **Interaction with capacity:** A station with `capacity = 2` can run two parts simultaneously, but if only one resource instance is available, both slots compete for it. Set resource quantity ≥ station capacity to avoid artificial bottlenecks from resource contention.

### Part I/O *(requires Parts library)*

Documents what part types flow through this station.

- **Input Parts** — up to 3 part types consumed. Add rows with **＋ Add Input**.
- **Output Part** — the part type produced.

In Phase 1, these are cosmetic labels. They appear as a badge on the canvas node (e.g. `Raw Casting → Machined Housing`) and are saved with the model for documentation purposes. Phase 2 will use them to enforce assembly synchronization (the station will wait until one of each input type is available).

### Batch Processing

Allows a station to accumulate multiple parts before starting a cycle — like a furnace, washer, or tray-based process.

#### Enable Batch Processing
Checkbox. When off, the station processes one part at a time (standard single-piece flow).

#### Batch Size
Maximum number of parts processed in a single cycle.

- All parts in the batch share the same processing time (one cycle duration for the whole batch).
- A batch of 8 with a 10-minute cycle = 10 minutes regardless of whether 3 or 8 parts are present (as long as Min Start Quantity is met).

#### Min. Start Quantity
Minimum parts that must be in queue before the station starts a batch.

- Prevents starting a cycle with only 1 part when you're expecting more.
- Example: `Batch Size = 8`, `Min Start Qty = 4` → waits until 4 parts arrive, then starts; processes up to 8 if more arrive before the cycle begins.

**Routing interaction:** The routing algorithm treats a station as *Idle* (state=2, highest priority) when the queue is below Min Start Quantity, signalling upstream nodes to feed it preferentially until the threshold is met. Once met, the state drops to *Funded* (0), preventing over-filling.

**Caution:** Setting Min Start Qty higher than the average arrival rate will cause the station to wait indefinitely. In finite simulations, parts may be stranded at batch stations at end-of-run if the threshold is never met — this is expected behaviour, not a bug.

### WIP Buffers

Controls the internal storage at a station. These buffers are "attached" to the node — travel time to and from them is zero. They are separate from the global WIP that travels between nodes via edges.

#### Allow Infeed WIP

Whether parts can queue at this station waiting for the server.

| Setting | Behavior |
|---|---|
| Checked, Infeed Qty blank | Unlimited queue. Parts always route here regardless of how many are waiting. |
| Checked, Infeed Qty = N | Queue capped at `N`. Once `N` parts are waiting, the routing algorithm stops sending more here. |
| Unchecked (No infeed area) | Parts only route here when the server is immediately free. If the server is busy, this station is skipped entirely by the router. |

**When to use no infeed:** Models a machine that requires an operator to load it — the operator can only load when the machine is free, so parts cannot "stack up" at the machine door. It forces the WIP to wait upstream rather than at the machine.

#### Allow Outfeed WIP

Whether finished parts can wait at the station before being moved downstream.

| Setting | Behavior |
|---|---|
| Checked, Outfeed Qty blank | Unlimited outfeed buffer. Station never blocks. |
| Checked, Outfeed Qty = N | Station blocks when `N` finished parts are waiting and cannot start another cycle until one leaves. |
| Unchecked | No outfeed buffer. Parts route immediately after processing. |

**When to use outfeed:** Models a machine that ejects parts into a gravity chute or tray — it can hold a few finished parts but backs up if downstream is slow.

**Interaction with resources:** If a resource is assigned and the station is blocked (outfeed full), the resource is held until the station can release — this can cause deadlocks if combined with circular dependencies. Design your outfeed limits carefully.

---

### Fallout / Rework

Models a quality failure rate where a fraction of parts must be re-processed.

#### Enable Fallout
Checkbox. When enabled, a red output handle appears at the bottom of the canvas node.

#### Fallout Rate (%)
Percentage of parts that fail at this station. Each part is evaluated independently by the RNG after processing completes.

- A 4% rate means roughly 1 in 25 parts fails (exact count varies by RNG seed and run length).
- Failed parts route out of the **red bottom handle**. If the red handle is not connected, failed parts are treated as pass-throughs (they continue as if they passed).
- Connect the red handle back to any upstream node to model a rework loop. The part re-enters that node's queue and must be re-processed.
- The `arrived_at` timestamp is reset when a part enters rework, so cycle time statistics reflect only the rework leg (not total time including original processing).

**Interaction with resources:** A failed part is a normal part from the resource's perspective. It competes for the same resource instances as new parts when it re-enters the queue.

---

### Processing Time

The duration of one processing cycle (or one batch cycle if batch processing is enabled).

Uses the [distribution system](#distributions). For most real processes, a **Normal** or **Lognormal** distribution is more realistic than Fixed.

---

## Sink Node

A Sink absorbs parts and records completion metrics. It has no configuration beyond a **Name**.

Each part that reaches a Sink gets a final cycle time recorded (time from creation at the Source to arrival at the Sink). This feeds the average cycle time shown in the Dashboard.

---

## Storage Node

A Storage node is a passive buffer — it holds parts indefinitely (or up to a capacity limit) and forwards them downstream when capacity allows.

### Name
Display label.

### Max Capacity
Maximum parts the storage can hold simultaneously.

- Leave blank for unlimited.
- When full, the routing algorithm stops sending parts here (state = -1, skipped by upstream routers).

**Routing priority:** Storage nodes do not have a static priority setting. Their priority is inferred dynamically based on their downstream connections — a storage feeding a bottleneck process inherits a high priority signal. This propagates through multi-hop chains automatically.

---

## Edges (Connections)

### Transport Resource
Assigns a resource to physically move parts along this connection.

- Without a transport resource, parts move instantly (zero travel time).
- With a transport resource, the resource is acquired, travels for the configured time, delivers the part, and is released.
- The same resource can be assigned to multiple edges, modelling a shared transport pool (e.g. one forklift covering multiple routes).

### Batch Size
How many parts the transport resource carries per trip.

- `1` (default) = one part per trip.
- `4` = resource waits at the source until 4 parts are ready, then carries them all in one trip.
- The resource is acquired once for the entire batch — efficient for AGVs or conveyors with fixed tray sizes.

**Interaction with routing:** Parts committed to a batch transport are counted as *pending arrivals* at the destination. The routing algorithm treats them as already queued, preventing over-filling the destination while the batch is in transit.

---

## Resources

A Resource is a shared pool of instances (operators, robots, forklifts, fixtures) that multiple stations and edges compete for.

### Name
Display name. Appears in the Dashboard, Event Log, and node/edge configuration dropdowns.

### Quantity
How many instances of this resource exist. An operator with quantity 2 creates Operator 1 and Operator 2 — both can work simultaneously on different tasks.

**Interaction with utilization:** Resource utilization in the Dashboard is the fraction of time that at least one instance was busy. Individual instance assignments are tracked in the Event Log (e.g. `PART_PROCESS_START` shows which specific instance handled each part).

### Assigning Resources

Resources can be assigned to:

| Location | Effect |
|---|---|
| Process Node → Resource Assignment | Resource is held for the full processing duration at that station |
| Edge → Transport Resource | Resource carries parts along that connection |

The same resource can be assigned to both a process and an edge, or to multiple edges. Instances are allocated on a first-come, first-served basis across all competing demands.

## Routing Tab (Travel Times)

Defines how long a transport resource takes to travel between any two nodes.

- Select a resource from the dropdown.
- Enter times in the matrix cells (rows = from, columns = to).
- **Symmetric** toggle: fills the reverse direction with the same value.
- Leave cells at 0 for instant travel (no delay, resource still provides contention).

Travel times only apply when the resource is assigned to an edge. If no travel time is set for a resource on a given route, travel time defaults to 0.

### Transport Behavior Without a Resource
Transport time is only modeled when an edge has a transport resource assigned.

If an edge does not use a transport resource, the transfer is treated as immediate. The part still respects downstream queue limits, infeed limits, and blocking rules, but no separate travel delay or transport-resource utilization is added.

Use a transport resource when movement itself is a constraint that should affect throughput, queueing, or utilization.

## Simulation Settings

| Setting | Detail |
|---|---|
| **Duration** | Total simulation time in your chosen units. It should be long enough for the system to reach steady state, typically 5 to 10 times the longest expected cycle time. |
| **Warmup Period** | Time before statistics start being collected. The system still runs normally while queues build and parts flow. Use this to fill the pipeline before measuring. Set to `0` to measure from the start. |
| **RNG Seed** | Integer seed for the random number generator. The same seed and the same model produce identical runs. Set to `0` to use a different random seed each run. |
| **Tick Interval** | How frequently the Dashboard updates during a run, in simulation time units. Smaller means a smoother live view but marginally slower simulation. |

## Dashboard Metrics

### Per-Node

| Metric | Definition |
|---|---|
| Queue Length | Parts waiting to be processed in the infeed buffer at end of run |
| In Process | Parts currently being worked on and occupying server capacity |
| Utilization | Fraction of simulation time the station was actively processing |
| Throughput | Total parts completed at this station during the measured run, post-warmup |
| Avg Cycle Time | Mean time from a part's creation at the Source to completion at the Sink |
 
**Interpreting utilization:** A station near 100% is either the bottleneck or is constrained by resource availability. A station at a low percentage has excess capacity. True bottlenecks drive queue buildup in the nodes immediately upstream.

### Per-Resource

| Metric | Definition |
|---|---|
| Utilization | Fraction of time at least one resource instance was in use |
| Requests Queued | Number of tasks waiting for an available instance at end of run |

## Event Log

The Event Log records a timestamped entry for every significant event during the run (post-warmup). Maximum 50,000 events; a warning appears if truncated.

### Event Types

| Event | When it fires |
|---|---|
| `PART_CREATED` | Source generates a new part |
| `PART_QUEUED` | Part enters a process node's infeed queue |
| `PART_PROCESS_START` | Part begins processing after server and resource acquisition |
| `PART_PROCESS_END` | Processing completes |
| `PART_TRANSPORT_START` | Transport resource is acquired and the part begins moving |
| `PART_TRANSPORT_END` | Part is delivered to the destination node |
| `PART_OUTFEED_ENTER` | Part enters the outfeed buffer |
| `PART_OUTFEED_LEAVE` | Part exits the outfeed buffer |
| `PART_FALLOUT` | Part fails quality check and is rerouted for rework |
| `PART_COMPLETED` | Part reaches a Sink |
| `RESOURCE_IDLE` | All instances of a resource become free simultaneously |

### Filters

- **Part #** — Show only events for a specific part ID.
- **Resource** — Show only events involving a specific resource instance (e.g. "Operator 2").
- **Node** — Show only events at a specific station.
- **Event Type** — Checkboxes to include/exclude specific event types.

Filters are combined (AND logic). Pagination shows 500 rows per page.

### Export CSV

Downloads all *currently filtered* events as a CSV with columns: Time, EventType, Part, Node, Resource, Details.

## Parts Tab

Defines a library of named parts for documentation and future assembly modeling.

### Part Name
Required. A human-readable name (e.g. "Raw Casting", "Machined Housing", "Assembled Unit").

### Part Number
Optional. A P/N code or identifier (e.g. "RC-001"). Displayed alongside the name in dropdowns and node badges.

### Assigning Parts to Nodes
| Node | Field | Meaning |
|---|---|---|
| Source | Output Part | This source generates this part type |
| Process | Input Parts (1–3) | This station consumes these part types |
| Process | Output Part | This station produces this part type |

When assigned, a small badge appears on the canvas node showing the flow (e.g. `Raw Casting → Machined Housing`). Parts are purely informational in Phase 1 — removing a part from the library does not break the simulation.

---

## Interaction Summary

This table captures the most important cross-option interactions:
| Scenario | What to know |
|---|---|
| High throughput machine + low-quantity operator | The operator becomes the bottleneck, not the machine. Station utilization will match operator availability. |
| Batch station + single upstream feeder | Upstream must produce faster than the batch station consumes or the batch will perpetually wait for `Min Start Quantity`. |
| No infeed + batch processing | This is contradictory. No infeed means the machine only accepts parts when free, while batch processing accumulates parts. Use infeed of at least `min_batch_size` on any batch station. |
| Outfeed buffer + shared downstream resource | If the outfeed fills while the downstream resource is busy, the machine blocks. Size outfeed based on expected downstream service time variance. |
| Fallout + no rework edge | Failed parts are treated as passed and continue downstream. In this configuration, fallout does not reduce final sink count. |
| Bottleneck priority + multiple parallel machines | One machine can get the BN badge while others stay Medium. Upstream will preferentially fill the BN machine and reduce its starvation risk. |
| Warmup = 0 on a batch station | Initial cycle-time stats will include ramp-up while the station fills its first batch. Use warmup of at least a few batch cycles for steadier measurements. |
| Same resource on process + edge | Parts compete for the same resource for both transport and processing. This can be realistic, but it can also spike utilization sharply. |
