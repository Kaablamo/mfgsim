import { useMemo, useState } from "react";
import { useGraphStore } from "@/store/graphStore";
import { useSimStore } from "@/store/simStore";
import { useWorkcenterStore } from "@/store/workcenterStore";
import type { SimEvent } from "@/types/wsMessages";

const PAGE_SIZE = 500;

// ── Event type display config ─────────────────────────────────────────────────
const EVENT_META: Record<string, { label: string; color: string }> = {
  PART_CREATED:        { label: "Created",        color: "bg-green-100 text-green-700" },
  PART_QUEUED:         { label: "Queued",          color: "bg-gray-100 text-gray-600" },
  PART_PROCESS_START:  { label: "Processing",      color: "bg-blue-100 text-blue-700" },
  PART_PROCESS_END:    { label: "Done",            color: "bg-blue-50 text-blue-500" },
  PART_TRANSPORT_START:{ label: "Transport Start", color: "bg-orange-100 text-orange-700" },
  PART_TRANSPORT_END:  { label: "Delivered",       color: "bg-orange-50 text-orange-600" },
  PART_OUTFEED_ENTER:  { label: "Outfeed In",      color: "bg-purple-100 text-purple-700" },
  PART_OUTFEED_LEAVE:  { label: "Outfeed Out",     color: "bg-purple-50 text-purple-600" },
  PART_COMPLETED:      { label: "Completed",       color: "bg-green-100 text-green-800" },
  RESOURCE_IDLE:       { label: "Idle",            color: "bg-gray-100 text-gray-500" },
};

const ALL_EVENT_TYPES = Object.keys(EVENT_META);

function formatTime(t: number): string {
  return t.toFixed(2);
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function getEventResourceDisplay(event: SimEvent, nodeWorkcenterNames: Map<string, string>): string {
  if (event.resource_label != null) {
    return event.resource_instance != null
      ? `${event.resource_label} ${event.resource_instance}`
      : event.resource_label;
  }
  if (event.node_id != null) {
    return nodeWorkcenterNames.get(event.node_id) ?? "";
  }
  return "";
}

function downloadCsv(rows: SimEvent[], nodeWorkcenterNames: Map<string, string>): void {
  const header = ["Time", "EventType", "Part", "Node", "Resource", "Details"];
  const lines = [
    header.join(","),
    ...rows.map((e) =>
      [
        csvEscape(formatTime(e.time)),
        csvEscape(e.event_type),
        csvEscape(e.entity_id != null ? `Part ${e.entity_id}` : ""),
        csvEscape(e.node_label),
        csvEscape(getEventResourceDisplay(e, nodeWorkcenterNames)),
        csvEscape(e.details),
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "simulation_log.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function EventLog() {
  const events = useSimStore((s) => s.events);
  const truncated = useSimStore((s) => s.eventsTruncated);
  const nodes = useGraphStore((s) => s.nodes);
  const workcenters = useWorkcenterStore((s) => s.workcenters);

  const [partFilter, setPartFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [nodeFilter, setNodeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(ALL_EVENT_TYPES));
  const [page, setPage] = useState(0);

  const nodeWorkcenterNames = useMemo(() => {
    const workcenterNames = new Map(workcenters.map((wc) => [wc.id, wc.name]));
    const mapping = new Map<string, string>();

    for (const node of nodes) {
      if (node.type !== "process") continue;
      const workcenterId =
        typeof node.data === "object" && node.data != null && "workcenter_id" in node.data
          ? node.data.workcenter_id
          : undefined;
      if (!workcenterId) continue;
      const workcenterName = workcenterNames.get(String(workcenterId));
      if (workcenterName) {
        mapping.set(node.id, workcenterName);
      }
    }

    return mapping;
  }, [nodes, workcenters]);

  // ── Derive dropdown options from events ────────────────────────────────────
  const resourceOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const e of events) {
      const key = getEventResourceDisplay(e, nodeWorkcenterNames);
      if (key !== "") {
        seen.add(key);
      }
    }
    return Array.from(seen).sort();
  }, [events, nodeWorkcenterNames]);

  const nodeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const e of events) {
      if (e.node_label) seen.add(e.node_label);
    }
    return Array.from(seen).sort();
  }, [events]);

  // ── Filtered events ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const partNum = partFilter.trim() !== "" ? Number(partFilter.trim()) : null;
    return events.filter((e) => {
      if (!typeFilter.has(e.event_type)) return false;
      if (partNum !== null && e.entity_id !== partNum) return false;
      if (resourceFilter !== "") {
        const key = getEventResourceDisplay(e, nodeWorkcenterNames);
        if (key !== resourceFilter) return false;
      }
      if (nodeFilter !== "" && e.node_label !== nodeFilter) return false;
      return true;
    });
  }, [events, partFilter, resourceFilter, nodeFilter, typeFilter, nodeWorkcenterNames]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function toggleType(t: string) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
    setPage(0);
  }

  function toggleAll() {
    if (typeFilter.size === ALL_EVENT_TYPES.length) {
      setTypeFilter(new Set());
    } else {
      setTypeFilter(new Set(ALL_EVENT_TYPES));
    }
    setPage(0);
  }

  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        No log data yet — run a simulation to see the event log.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-800">Event Log</span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {events.length.toLocaleString()} events
        </span>
        {truncated && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            Truncated at 50,000 — filter to see earlier events
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => downloadCsv(filtered, nodeWorkcenterNames)}
          className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium"
        >
          Export CSV ({filtered.length.toLocaleString()})
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-start gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50 shrink-0">
        {/* Part # */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Part #</label>
          <input
            type="number"
            min={1}
            placeholder="Any"
            value={partFilter}
            onChange={(e) => { setPartFilter(e.target.value); setPage(0); }}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-xs bg-white"
          />
        </div>

        {/* Resource */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Resource</label>
          <select
            value={resourceFilter}
            onChange={(e) => { setResourceFilter(e.target.value); setPage(0); }}
            className="rounded border border-gray-300 px-2 py-1 text-xs bg-white"
          >
            <option value="">All</option>
            {resourceOptions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Node */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Node</label>
          <select
            value={nodeFilter}
            onChange={(e) => { setNodeFilter(e.target.value); setPage(0); }}
            className="rounded border border-gray-300 px-2 py-1 text-xs bg-white"
          >
            <option value="">All</option>
            {nodeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* Event types */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
            Event Types
            <button
              onClick={toggleAll}
              className="ml-2 text-blue-600 hover:text-blue-800 font-medium normal-case"
            >
              {typeFilter.size === ALL_EVENT_TYPES.length ? "None" : "All"}
            </button>
          </label>
          <div className="flex flex-wrap gap-1">
            {ALL_EVENT_TYPES.map((t) => {
              const meta = EVENT_META[t];
              const active = typeFilter.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium border transition-opacity
                    ${active ? meta.color + " border-transparent" : "bg-white border-gray-200 text-gray-300"}`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#e5e7eb]">
            <tr className="text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-2 w-20">Time</th>
              <th className="px-3 py-2 w-32">Event</th>
              <th className="px-3 py-2 w-24 whitespace-nowrap">Part</th>
              <th className="px-3 py-2 w-36">Node</th>
              <th className="px-3 py-2 w-36">Resource</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((e, i) => {
              const meta = EVENT_META[e.event_type] ?? { label: e.event_type, color: "bg-gray-100 text-gray-600" };
              const resourceDisplay = getEventResourceDisplay(e, nodeWorkcenterNames);
              return (
                <tr
                  key={safePage * PAGE_SIZE + i}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-1.5 font-mono text-gray-600">{formatTime(e.time)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.color}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                    {e.entity_id != null ? `Part ${e.entity_id}` : ""}
                  </td>
                  <td className="px-3 py-1.5 text-gray-700 max-w-[144px] truncate">
                    {e.node_label ?? ""}
                  </td>
                  <td className="px-3 py-1.5 text-gray-700">
                    {resourceDisplay}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">
                    {e.details ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {pageRows.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-12">
            No events match the current filters.
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white shrink-0 text-xs text-gray-500">
          <span>
            Showing {(safePage * PAGE_SIZE + 1).toLocaleString()}–
            {Math.min((safePage + 1) * PAGE_SIZE, filtered.length).toLocaleString()} of{" "}
            {filtered.length.toLocaleString()} filtered events
          </span>
          <div className="flex gap-2">
            <button
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Prev
            </button>
            <button
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
