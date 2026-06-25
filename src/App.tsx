import React, { useState, useEffect } from "react";
import { useSessionStore } from "@/state/useSessionStore";
import { useScenarioStore } from "@/state/useScenarioStore";
import { useUiStore } from "@/state/useUiStore";
import { useRealtimeRoom } from "@/realtime/useRealtimeRoom";
import { LandingPage } from "@/components/layout/LandingPage";
import { TopBar } from "@/components/layout/TopBar";
import { ApparatusTray } from "@/components/scenario/ApparatusTray";
import { TacticalCanvas } from "@/components/canvas/TacticalCanvas";
import { RightDrawer } from "@/components/scenario/RightDrawer";
import { TimerBenchmarkBar } from "@/components/timer/TimerBenchmarkBar";
import { sampleScenarios } from "@/data/sampleScenarios";
import type { BuildingObject, HydrantObject } from "@/types/scenario";
import "./styles/globals.css";

function App() {
  const { isSolo, roomCode, setRoomCode, setIsSolo } = useSessionStore();
  const { run, setScenarioRun } = useScenarioStore();
  
  const [view, setView] = useState<"home" | "scenario-playing">("home");

  // Mount the real-time sync hook
  // This automatically sets up the WebSocket connection and message routing
  // whenever a roomCode is set and isSolo is false!
  useRealtimeRoom();

  const handleNavigate = (nextView: "home" | "scenario-playing") => {
    setView(nextView);
  };

  const handleBackToHome = () => {
    if (confirm("Are you sure you want to exit the current tactical scene? Unsaved changes may be lost.")) {
      setRoomCode(null);
      setIsSolo(true);
      setView("home");
    }
  };

  // Build programmatic Overhead City Block Scene scaffold
  useEffect(() => {
    if (view === "scenario-playing" && run.scenarioId !== "uninitialized") {
      const template = sampleScenarios.find(s => s.id === run.scenarioId) || sampleScenarios[0];
      
      // Inject standard template structures into active run objects if empty
      if (Object.keys(run.objects).length === 0) {
        const initialObjects: Record<string, any> = {};
        
        // 1. Add buildings from template
        template.buildings.forEach((bldg) => {
          initialObjects[bldg.id] = { ...bldg };
        });

        // 2. Add hydrants from template
        template.hydrants.forEach((hyd) => {
          initialObjects[hyd.id] = { ...hyd };
        });

        // Update run state
        useScenarioStore.setState((state) => ({
          run: {
            ...state.run,
            objects: initialObjects
          }
        }));
      }
    }
  }, [view, run.scenarioId]);

  if (view === "home") {
    return <LandingPage onNavigate={handleNavigate} />;
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden text-slate-100 font-sans">
      {/* 1. Header Navigation & Connection status & Exports */}
      <TopBar onBack={handleBackToHome} />

      {/* 2. Middle Grid Panel */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Left Tray: Draggable Apparatus templates */}
        <ApparatusTray />

        {/* Center: Overhead animated React-Konva Tactical Board */}
        <TacticalCanvas />

        {/* Right Drawer: Instructor controls, Checklists, and Active Roster */}
        <RightDrawer />
      </div>

      {/* 3. Bottom Utility Bar: Controls, Timer and 18 tactical benchmark buttons */}
      <TimerBenchmarkBar />
    </div>
  );
}

export default App;
