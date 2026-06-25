import { useEffect, useRef } from "react";
import { RealtimeClient } from "./client";
import { useSessionStore } from "@/state/useSessionStore";
import { useScenarioStore } from "@/state/useScenarioStore";
import { useUiStore } from "@/state/useUiStore";
import type { ServerMessage } from "./protocol";

export function useRealtimeRoom() {
  const { roomCode, designation, role, isSolo, setIsConnected } = useSessionStore();
  const { setWsSend, setScenarioRun, updateRoster, run } = useScenarioStore();
  const { setSelectedObjectId } = useUiStore();
  
  const clientRef = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    // If we are in Solo mode or there is no roomCode, do not connect
    if (isSolo || !roomCode) {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
        setWsSend(null);
      }
      setIsConnected(false);
      return;
    }

    const isHost = role === "Host/Instructor";

    console.log(`Initializing realtime connection to room ${roomCode} as ${designation} (Host: ${isHost})`);

    const client = new RealtimeClient(
      roomCode,
      designation,
      isHost,
      // Message handler callback
      (msg: ServerMessage) => {
        const { type, payload } = msg;

        switch (type) {
          case "joined_ack":
            console.log("Successfully connected to room server, payload:", payload);
            useSessionStore.getState().setClientId(payload.clientId);
            if (payload.state.scenarioId === "uninitialized" && role === "Host/Instructor") {
              // Server is uninitialized, upload local run configuration (buildings, hydrants, etc.)
              const currentRun = useScenarioStore.getState().run;
              client.send({
                type: "scenario_patch",
                patch: currentRun
              });
            } else {
              setScenarioRun(payload.state);
            }
            break;

          case "room_snapshot":
            console.log("Received scenario room snapshot from server");
            setScenarioRun(payload);
            break;

          case "roster_update":
            console.log("Roster updated:", payload);
            updateRoster(payload);
            break;

          case "scenario_patch_broadcast":
            useScenarioStore.setState((state) => ({
              run: {
                ...state.run,
                scenarioId: payload.scenarioId,
                scenarioTitle: payload.scenarioTitle
              }
            }));
            break;

          case "object_broadcast":
            useScenarioStore.setState((state) => {
              const objects = { ...state.run.objects };
              if (payload.action === "add" || payload.action === "update") {
                objects[payload.object.id] = payload.object;
              } else if (payload.action === "delete") {
                delete objects[payload.id];
                if (useUiStore.getState().selectedObjectId === payload.id) {
                  setSelectedObjectId(null);
                }
              }
              return { run: { ...state.run, objects } };
            });
            break;

          case "hose_broadcast":
            useScenarioStore.setState((state) => {
              const hoses = { ...state.run.hoses };
              if (payload.action === "start" || payload.action === "complete") {
                hoses[payload.hose.id] = payload.hose;
              } else if (payload.action === "update") {
                if (hoses[payload.id]) {
                  hoses[payload.id].points = payload.points;
                }
              }
              return { run: { ...state.run, hoses } };
            });
            break;

          case "benchmark_broadcast":
            useScenarioStore.setState((state) => {
              const event = {
                id: Math.random().toString(36).substring(2, 9),
                type: "log",
                description: `Benchmark marked: ${payload.name} (by ${payload.actor})`,
                elapsedSeconds: payload.elapsedSeconds,
                absoluteTimestamp: payload.absoluteTimestamp,
                actor: payload.actor,
                metadata: {
                  assignedUnit: payload.assignedUnit,
                  note: payload.note
                }
              };
              return {
                run: {
                  ...state.run,
                  timeline: [...state.run.timeline, event]
                }
              };
            });
            break;

          case "timer_broadcast":
            useScenarioStore.setState((state) => ({
              run: { ...state.run, timer: payload }
            }));
            break;

          case "inject_broadcast":
            useScenarioStore.setState((state) => {
              const timeline = state.run.timeline.map((item) => {
                if (item.id === payload.id) {
                  return { ...item, metadata: { ...item.metadata, revealedAt: payload.revealedAt } };
                }
                return item;
              });
              return { run: { ...state.run, timeline } };
            });
            break;

          case "tactical_broadcast":
            useScenarioStore.setState((state) => {
              const tacticalConsiderations = { ...state.run.tacticalConsiderations };
              tacticalConsiderations[payload.id] = payload.tactical;
              return { run: { ...state.run, tacticalConsiderations } };
            });
            break;

          case "timeline_broadcast":
            useScenarioStore.setState((state) => ({
              run: {
                ...state.run,
                timeline: [...state.run.timeline, payload]
              }
            }));
            break;

          case "error":
            console.error("Realtime room error:", payload);
            break;
        }
      },
      // Status change handler
      (status) => {
        setIsConnected(status === "connected");
      }
    );

    clientRef.current = client;
    
    // Feed the send function to useScenarioStore so actions can call it
    setWsSend((msg) => client.send(msg));

    return () => {
      console.log("Cleaning up realtime room connection...");
      client.disconnect();
      clientRef.current = null;
      setWsSend(null);
      setIsConnected(false);
    };
  }, [roomCode, isSolo, designation, role]);

  return clientRef.current;
}
