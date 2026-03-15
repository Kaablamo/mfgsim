import { useSimStore } from "@/store/simStore";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const BAR_PX = 30; // pixels allocated per bar row
const Y_AXIS_W = 110; // wide enough for most node names
const SIM_STATE_COLORS: Record<string, string> = {
  idle: "bg-gray-100 text-gray-500",
  warmup: "bg-yellow-100 text-yellow-700",
  running: "bg-green-100 text-green-700",
  stopped: "bg-red-100 text-red-600",
};

const NODE_TYPE_COLORS: Record<string, string> = {
  source: "bg-green-100 text-green-700",
  process: "bg-blue-100 text-blue-700",
  sink: "bg-red-100 text-red-700",
  storage: "bg-amber-100 text-amber-700",
};

function formatPercent(value: number): string {
  return `${value}%`;
}

function getCountLabel(nodeType: string): "Generated" | "Completed" {
  return nodeType === "source" ? "Generated" : "Completed";
}

export function Dashboard() {
  const { history, liveNodes, liveResources, summary, simTime, simState } = useSimStore();

  const nonStorageNodes = liveNodes.filter((n) => n.node_type !== "storage");
  const storageNodes = liveNodes.filter((n) => n.node_type === "storage");

  const wipData = history.map((h) => ({ t: h.sim_time.toFixed(1), wip: h.total_wip }));
  const wipChartWidth = Math.max(400, wipData.length * 5);

  const processChartData = nonStorageNodes
    .filter((n) => n.node_type === "process")
    .map((n) => ({
      name: n.label,
      utilization: parseFloat((n.utilization * 100).toFixed(1)),
      queue: n.queue_length,
    }));

  const resourceUtilData = liveResources.map((r) => ({
    name: r.name,
    utilization: parseFloat((r.utilization * 100).toFixed(1)),
  }));

  const storageTpData = storageNodes.map((n) => ({
    name: n.label,
    rate: parseFloat(n.throughput.toFixed(4)),
    total: n.total_completed,
  }));

  const processChartH = Math.max(160, processChartData.length * BAR_PX + 24);
  const resourceChartH = Math.max(120, resourceUtilData.length * BAR_PX + 24);
  const storageChartH = Math.max(80, storageTpData.length * BAR_PX + 24);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50">
      <div className="flex items-center gap-4 px-4 py-2.5 bg-white border-b border-gray-200">
        <SimStateChip state={simState} />
        <span className="text-sm text-gray-600">
          Sim Time: <span className="font-semibold text-gray-800">{simTime.toFixed(2)}</span>
        </span>
        {summary && (
          <span className="text-sm text-gray-600">
            Throughput:{" "}
            <span className="font-semibold text-green-700">{summary.total_throughput} units</span>
            <span
              className="ml-2 text-gray-400 cursor-help underline decoration-dotted"
              title={`${summary.total_throughput} entities reached the Sink(s) by run_end. "${summary.sim_run_seconds}s wall" is the real-world compute time for the Python engine.`}
            >
              in {summary.sim_run_seconds}s wall
            </span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 p-4 flex-1">
        <ChartCard title="WIP Over Time">
          <div className="overflow-x-auto">
            <LineChart
              width={wipChartWidth}
              height={185}
              data={wipData}
              margin={{ top: 4, right: 8, bottom: 18, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10 }}
                label={{ value: "Sim Time", position: "insideBottom", offset: -4, fontSize: 10 }}
              />
              <YAxis tick={{ fontSize: 10 }} width={32} />
              <Tooltip />
              <Line type="monotone" dataKey="wip" stroke="#3b82f6" dot={false} strokeWidth={2} name="WIP" />
            </LineChart>
          </div>
        </ChartCard>

        <ChartCard title="Resource Utilization (%)">
          {resourceUtilData.length > 0 ? (
            <ResponsiveContainer width="100%" height={resourceChartH}>
              <BarChart data={resourceUtilData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={Y_AXIS_W} />
                <Tooltip formatter={(value) => formatPercent(Number(value))} />
                <Bar dataKey="utilization" fill="#10b981" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[120px] flex items-center justify-center text-sm text-gray-400">
              No resources defined
            </div>
          )}
        </ChartCard>

        <ChartCard title="Queue Lengths">
          {processChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={processChartH}>
              <BarChart data={processChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={Y_AXIS_W} />
                <Tooltip />
                <Bar dataKey="queue" fill="#f59e0b" radius={[0, 3, 3, 0]} name="Queue" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[120px] flex items-center justify-center text-sm text-gray-400">
              No process nodes
            </div>
          )}
        </ChartCard>

        <ChartCard title="Node Utilization (%)">
          {processChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={processChartH}>
              <BarChart data={processChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={Y_AXIS_W} />
                <Tooltip formatter={(value) => formatPercent(Number(value))} />
                <Bar dataKey="utilization" fill="#3b82f6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[120px] flex items-center justify-center text-sm text-gray-400">
              No process nodes
            </div>
          )}
        </ChartCard>

        {storageNodes.length > 0 && (
          <div className="col-span-2">
            <ChartCard title="Storage Utilization — Parts per Unit Time">
              <ResponsiveContainer width="100%" height={storageChartH}>
                <BarChart data={storageTpData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={Y_AXIS_W} />
                  <Tooltip
                    formatter={(value, _name, props) =>
                      [`${value} parts/t (${props.payload.total} total)`, "Throughput"]
                    }
                  />
                  <Bar dataKey="rate" fill="#f59e0b" radius={[0, 3, 3, 0]} name="Parts/t" />
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-2 text-[11px] text-gray-400">
                Storage nodes are pass-through buffers — parts route through instantly in push simulation.
                This chart shows throughput rate (parts/unit time) as a proxy for how heavily each buffer
                was used. Check downstream process queue lengths to see accumulated WIP.
              </p>
            </ChartCard>
          </div>
        )}

        {summary && (
          <div className="col-span-2">
            <ChartCard title="Summary — Per Node">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {[
                        "Node",
                        "Type",
                        "Generated / Completed",
                        "Avg Time in Node",
                        "Utilization",
                        "Throughput",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                        >
                          {h}
                          {h === "Avg Time in Node" && (
                            <span className="block text-[10px] font-normal normal-case tracking-normal text-gray-400">
                              queue wait + processing
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.nodes.map((n) => {
                      const isSource = n.node_type === "source";
                      const isSink = n.node_type === "sink";
                      const isStorage = n.node_type === "storage";
                      const countLabel = getCountLabel(n.node_type);
                      return (
                        <tr
                          key={n.node_id}
                          className={`border-b border-gray-100 hover:bg-gray-50 ${
                            isStorage ? "bg-amber-50/40" : ""
                          }`}
                        >
                          <td className="py-2 px-3 font-medium text-gray-800">{n.label}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                NODE_TYPE_COLORS[n.node_type] ?? "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {n.node_type}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-600">
                            <span className="text-xs text-gray-400 mr-1">{countLabel}:</span>
                            {n.total_completed}
                          </td>
                          <td className="py-2 px-3 text-gray-600">
                            {isSource || isSink
                              ? "—"
                              : isStorage && n.avg_cycle_time < 0.001
                              ? <span className="text-gray-400 text-xs">≈ 0 (pass-through)</span>
                              : n.avg_cycle_time.toFixed(3)}
                          </td>
                          <td className="py-2 px-3 text-gray-600">
                            {isSource || isStorage
                              ? "—"
                              : isSink
                              ? "—"
                              : `${(n.utilization * 100).toFixed(1)}%`}
                          </td>
                          <td className="py-2 px-3 text-gray-600">
                            {isSource
                              ? "—"
                              : `${n.throughput.toFixed(4)}/t`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  );
}

function SimStateChip({ state }: { state: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SIM_STATE_COLORS[state] ?? "bg-gray-100 text-gray-500"}`}>
      {state.toUpperCase()}
    </span>
  );
}
