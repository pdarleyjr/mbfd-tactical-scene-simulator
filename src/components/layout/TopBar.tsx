import React, { useState } from "react";
import { useSessionStore } from "@/state/useSessionStore";
import { useScenarioStore } from "@/state/useScenarioStore";
import { useUiStore } from "@/state/useUiStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Shield, Radio, Users, Download, ArrowLeft, Camera, FileText, Database, ClipboardList, SlidersHorizontal } from "lucide-react";
import { exportAfterActionReport } from "@/lib/exportPdf";
import { formatElapsed, formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onBack: () => void;
}

export function TopBar({ onBack }: TopBarProps) {
  const { roomCode, isSolo, isConnected, role, designation } = useSessionStore();
  const { run } = useScenarioStore();
  const { getStageDataUrl, isRightDrawerOpen, setRightDrawerOpen } = useUiStore();

  const [showTimelineModal, setShowTimelineModal] = useState(false);

  // Connection State indicator
  const renderConnectionBadge = () => {
    if (isSolo) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase text-slate-400 bg-slate-900 border border-slate-800 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> SOLO DRILL
        </span>
      );
    }

    if (isConnected) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase text-green-400 bg-green-950/40 border border-green-900 rounded-full animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> LIVE CONNECTED
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase text-red-400 bg-red-950/40 border border-red-900 rounded-full animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> RECONNECTING
      </span>
    );
  };

  // 1. Export as PNG image
  const handleExportPng = () => {
    if (getStageDataUrl) {
      const dataUrl = getStageDataUrl();
      if (!dataUrl) {
        alert("Canvas is still loading. Try again in a second.");
        return;
      }
      const link = document.createElement("a");
      link.download = `mbfd_tactical_board_${run.roomCode || "solo"}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert("PNG Exporter not bound yet.");
    }
  };

  // 2. Export full scenario JSON state
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(run, null, 2));
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `mbfd_tactical_run_${run.roomCode || "solo"}.json`);
    dlAnchorElem.click();
  };

  // 3. Export PDF report
  const handleExportPdf = () => {
    let dataUrl = "";
    if (getStageDataUrl) {
      dataUrl = getStageDataUrl();
    }
    exportAfterActionReport(run, dataUrl);
  };

  return (
    <div className="h-[64px] bg-slate-950 border-b border-border flex items-center justify-between px-6 shrink-0 select-none">
      {/* Left Back navigation */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-200 cursor-pointer h-10 w-10 border border-slate-900 rounded-lg active:scale-95" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="text-left flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-black text-slate-100 uppercase tracking-wider m-0 leading-none">
              {run.scenarioTitle}
            </h1>
            {!isSolo && (
              <span className="px-1.5 py-0.5 text-[9px] bg-amber-950 border border-amber-900 text-amber-500 rounded font-black tracking-widest leading-none">
                ROOM: {run.roomCode}
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
            Role: {role === "Host/Instructor" ? "INSTRUCTOR" : "CREW PARTICIPANT"} ({designation})
          </span>
        </div>
      </div>

      {/* Middle status presence */}
      <div className="flex items-center gap-3">
        {renderConnectionBadge()}
        
        {/* Toggle Timeline Drawer */}
        <Button variant="tactical" size="sm" className="font-bold text-xs" onClick={() => setShowTimelineModal(true)}>
          <ClipboardList className="w-3.5 h-3.5 mr-1 text-amber-500" />
          Event Timeline ({run.timeline.length})
        </Button>
      </div>

      {/* Right side Exports toolbar */}
      <div className="flex items-center gap-2">
        <Button 
          variant={isRightDrawerOpen ? "gold" : "tactical"} 
          size="sm" 
          className="text-xs font-bold" 
          onClick={() => setRightDrawerOpen(!isRightDrawerOpen)}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
          {isRightDrawerOpen ? "Hide Controls" : "Show Controls"}
        </Button>
        <Button variant="tactical" size="sm" className="text-xs" onClick={handleExportPng}>
          <Camera className="w-3.5 h-3.5 mr-1" /> Board PNG
        </Button>
        <Button variant="tactical" size="sm" className="text-xs" onClick={handleExportJson}>
          <Database className="w-3.5 h-3.5 mr-1" /> Backup JSON
        </Button>
        <Button variant="mbfd" size="sm" className="text-xs font-bold" onClick={handleExportPdf}>
          <FileText className="w-3.5 h-3.5 mr-1" /> PDF Report (AAR)
        </Button>
      </div>

      {/* DETAILED EVENT TIMELINE MODAL */}
      <Dialog open={showTimelineModal} onOpenChange={setShowTimelineModal}>
        <DialogContent className="sm:max-w-[480px] bg-slate-900 border border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase text-red-500 flex items-center gap-2 border-b border-slate-850 pb-2">
              <ClipboardList className="w-5 h-5 text-amber-500" />
              Scenario Event Timeline Log
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Chronological feed of crew deployments, water lines, tactical benchmarks, and inject reveals.
            </DialogDescription>
          </DialogHeader>

          {/* Timeline Feed items */}
          <div className="space-y-2 py-4 max-h-[400px] overflow-y-auto pr-1">
            {run.timeline.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-4">No events logged yet. Place apparatus or start the clock to begin.</p>
            ) : (
              [...run.timeline].reverse().map((evt) => (
                <div key={evt.id} className="flex gap-3 text-left p-2.5 bg-slate-950/50 border border-slate-850 rounded">
                  {/* Elapsed Timer badge */}
                  <span className="h-6 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-black font-mono text-amber-500 text-center shrink-0">
                    {formatElapsed(evt.elapsedSeconds)}
                  </span>
                  
                  {/* Event Details */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-200 font-bold leading-tight">{evt.description}</span>
                    <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">
                      BY {evt.actor} @ {formatDateTime(evt.absoluteTimestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="text-slate-400 border-slate-800" onClick={() => setShowTimelineModal(false)}>
              Close Timeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
