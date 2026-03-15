import { useEffect, useRef } from "react";
import { WS_URL } from "@/api/client";
import { useSimStore } from "@/store/simStore";
import type { WsMessage } from "@/types/wsMessages";

export function useSimWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const shutdownRequested = useSimStore((s) => s.shutdownRequested);
  const { setSimState, applyTick, applySummary, applyEventLog } = useSimStore();

  useEffect(() => {
    if (shutdownRequested) {
      wsRef.current?.close();
      return;
    }

    // Guard reconnects so cleanup and React StrictMode do not create extra sockets.
    let active = true;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      if (!active) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          if (msg.msg_type === "tick") {
            applyTick(msg.sim_time, msg.nodes, msg.resources, msg.total_wip);
          } else if (msg.msg_type === "status") {
            setSimState(msg.state as never);
          } else if (msg.msg_type === "summary") {
            applySummary(msg);
            setSimState("stopped");
          } else if (msg.msg_type === "event_log") {
            applyEventLog(msg);
          } else if (msg.msg_type === "error") {
            console.error("[SimWS] Engine error:", msg.code, msg.message);
            setSimState("stopped");
          }
        } catch (e) {
          console.warn("[SimWS] Failed to parse message", e);
        }
      };

      ws.onclose = () => {
        if (active) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      active = false;
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [shutdownRequested]);
}
