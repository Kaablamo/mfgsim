import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useSimWebSocket } from "@/hooks/useSimWebSocket";
import { NodeEditor } from "@/components/NodeEditor/NodeEditor";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { Dashboard } from "@/components/Dashboard/Dashboard";
import { SimControls } from "@/components/SimControls/SimControls";
import { ResourcePanel } from "@/components/Resources/ResourcePanel";
import { ResourceMappingPanel } from "@/components/ResourceMapping/ResourceMappingPanel";
import { NodeListPanel } from "@/components/NodeList/NodeListPanel";
import { EventLog } from "@/components/EventLog/EventLog";
import { PartsPanel } from "@/components/Parts/PartsPanel";
import { WorkcenterPanel } from "@/components/Workcenters/WorkcenterPanel";
import { useSimStore } from "@/store/simStore";

type Tab = "editor" | "dashboard" | "routing" | "log";
type LeftTab = "resources" | "workcenters" | "parts" | "nodes";

const MAIN_TABS: { id: Tab; label: string }[] = [
  { id: "editor", label: "Model Editor" },
  { id: "dashboard", label: "Dashboard" },
  { id: "routing", label: "Routing" },
  { id: "log", label: "Log" },
];

const LEFT_TAB_LABELS: Record<LeftTab, string> = {
  resources: "Res.",
  workcenters: "WC",
  parts: "Parts",
  nodes: "Nodes",
};

export default function App() {
  useSimWebSocket();
  const [tab, setTab] = useState<Tab>("editor");
  const [leftTab, setLeftTab] = useState<LeftTab>("resources");
  const shutdownRequested = useSimStore((s) => s.shutdownRequested);

  if (shutdownRequested) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 px-6">
        <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">MfgSim shut down</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            The local MfgSim server has been stopped. Close this tab and relaunch the app from
            the executable when you are ready to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100 font-sans">
      <SimControls />

      <div className="flex items-center gap-0 bg-white border-b border-gray-200 px-4">
        {MAIN_TABS.map((tabOption) => (
          <button
            key={tabOption.id}
            onClick={() => setTab(tabOption.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab === tabOption.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
          >
            {tabOption.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {tab === "editor" && (
          <>
            <div className="w-56 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
              <div className="flex border-b border-gray-200 shrink-0">
                {(["resources", "workcenters", "parts", "nodes"] as LeftTab[]).map((lt) => (
                  <button
                    key={lt}
                    onClick={() => setLeftTab(lt)}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors truncate
                      ${leftTab === lt
                        ? "border-b-2 border-blue-500 text-blue-700 bg-blue-50"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    {LEFT_TAB_LABELS[lt]}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto">
                {leftTab === "resources" ? <ResourcePanel />
                  : leftTab === "workcenters" ? <WorkcenterPanel />
                  : leftTab === "parts" ? <PartsPanel />
                  : <NodeListPanel />}
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <ReactFlowProvider>
                <NodeEditor />
              </ReactFlowProvider>
            </div>

            <Sidebar />
          </>
        )}

        {tab === "dashboard" && (
          <div className="flex-1 overflow-hidden">
            <Dashboard />
          </div>
        )}

        {tab === "routing" && (
          <div className="flex-1 overflow-hidden">
            <ResourceMappingPanel />
          </div>
        )}

        {tab === "log" && (
          <div className="flex-1 overflow-hidden">
            <EventLog />
          </div>
        )}
      </div>
    </div>
  );
}
