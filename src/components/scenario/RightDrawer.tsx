import React, { useState } from "react";
import { useScenarioStore } from "@/state/useScenarioStore";
import { useSessionStore } from "@/state/useSessionStore";
import { useUiStore } from "@/state/useUiStore";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { RosterView } from "@/components/roster/RosterView";
import { Shield, Sparkles, Send, Play, Pause, RotateCcw, Flame, Wind, AlertCircle, HelpCircle } from "lucide-react";
import { defaultTacticalConsiderations } from "@/data/tacticalConsiderations";
import type { BuildingObject, TacticalConsideration, Inject } from "@/types/scenario";
import { generateId } from "@/lib/ids";

export function RightDrawer() {
  const { run, updateObject, updateTactic, startTimer, pauseTimer, resetTimer, revealInject } = useScenarioStore();
  const { role, isSolo } = useSessionStore();
  const { activeTabRight, setActiveTabRight, selectedObjectId, setSelectedObjectId, isLocked, setIsLocked, setActiveTool } = useUiStore();

  const [customInjectTitle, setCustomInjectTitle] = useState("");
  const [customInjectDesc, setCustomInjectDesc] = useState("");
  const [selectedIncidentBuildingId, setSelectedIncidentBuildingId] = useState("");

  const isInstructor = role === "Host/Instructor" || isSolo;

  // Filter building objects
  const buildings = Object.values(run.objects).filter(o => o.type === "building") as BuildingObject[];
  const selectedBldg = run.objects[selectedObjectId || ""]?.type === "building" 
    ? run.objects[selectedObjectId || ""] as BuildingObject 
    : null;

  const handleUpdateFire = (intensity: any) => {
    if (selectedObjectId && selectedBldg) {
      updateObject(selectedObjectId, {
        fireCondition: { ...selectedBldg.fireCondition, intensity }
      });
    }
  };

  const handleUpdateSmoke = (level: any) => {
    if (selectedObjectId && selectedBldg) {
      updateObject(selectedObjectId, {
        smokeCondition: { ...selectedBldg.smokeCondition, level }
      });
    }
  };

  const handleToggleAsIncident = () => {
    if (selectedObjectId && selectedBldg) {
      // Toggle current building
      const nextVal = !selectedBldg.selectedAsIncidentBuilding;
      updateObject(selectedObjectId, { selectedAsIncidentBuilding: nextVal });
    }
  };

  const handleRevealInject = (injId: string) => {
    revealInject(injId);
  };

  const handleAddCustomInject = () => {
    if (!customInjectTitle || !customInjectDesc) return;
    
    // Create new inject event
    const newInjectEvent = {
      id: generateId("inj-custom"),
      title: customInjectTitle,
      description: customInjectDesc,
      revealed: true,
      revealedAt: new Date().toISOString()
    };

    useScenarioStore.getState().logTimelineEvent("Instructor", `revealed custom inject: ${customInjectTitle}`, undefined);
    
    // Clear inputs
    setCustomInjectTitle("");
    setCustomInjectDesc("");
  };

  return (
    <div className="w-[340px] bg-slate-900 border-l border-border p-4 flex flex-col gap-4 overflow-y-auto shrink-0 select-none h-full">
      {/* Top Tabs Switcher */}
      <Tabs value={activeTabRight} onValueChange={(val: any) => setActiveTabRight(val)} className="w-full">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="tactics">Tactical Check</TabsTrigger>
          <TabsTrigger value="instructor">Instructor</TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/* TACTICAL CONSIDERATIONS / INCIDENT OBJECTIVES CHECKLIST TAB */}
        {/* ============================================================== */}
        <TabsContent value="tactics" className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-left">
            <span className="text-xs font-black text-slate-200 uppercase tracking-widest block">
              Tactical Actions Checklist
            </span>
            <span className="text-[10px] text-slate-500 leading-normal block mb-2">
              Mark checklist progress and assign tactical units to coordinate size-up.
            </span>
          </div>

          <div className="space-y-3">
            {Object.values(run.tacticalConsiderations).map((tc: TacticalConsideration) => (
              <Card key={tc.id} className="bg-slate-950 border-slate-800 p-3 text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-slate-100 uppercase tracking-wide">
                    {tc.category}
                  </span>
                  
                  {/* Status pills selector */}
                  <select
                    value={tc.status}
                    onChange={(e) => updateTactic(tc.id, { status: e.target.value as any })}
                    className="bg-slate-900 border border-slate-800 text-[10px] rounded p-1 font-bold text-slate-300"
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="Assigned">Assigned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Complete">Complete</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  {/* Notes / description */}
                  <p className="text-[11px] text-slate-400 font-semibold">{tc.notes}</p>
                  
                  {/* Assignee designation text */}
                  <div className="flex items-center gap-2 mt-1 pt-1.5 border-t border-slate-900">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ASSIGNED UNIT:</span>
                    <input
                      type="text"
                      placeholder="E.g., E1, L1, R1"
                      value={tc.assignedUnit || ""}
                      onChange={(e) => updateTactic(tc.id, { assignedUnit: e.target.value.toUpperCase() })}
                      className="bg-transparent border-b border-transparent hover:border-slate-800 focus:border-amber-500 text-[11px] font-bold text-slate-200 w-28 uppercase py-0.5"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Roster View block at bottom of checklist */}
          <div className="mt-4 pt-4 border-t border-slate-800">
            <RosterView />
          </div>
        </TabsContent>

        {/* ============================================================== */}
        {/* INSTRUCTOR / TRAINING CONTROLLER UTILITIES PANEL TAB */}
        {/* ============================================================== */}
        <TabsContent value="instructor" className="mt-4 flex flex-col gap-4">
          {!isInstructor ? (
            <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-lg text-center flex flex-col items-center justify-center gap-2">
              <Shield className="w-8 h-8 text-slate-600" />
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Instructor Only</span>
              <p className="text-[11px] text-slate-500 max-w-[200px]">
                You are registered as a Participant. Instructor tools are only available in solo mode or to the room host.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-left">
              {/* Scenario Timer Controls */}
              <div className="space-y-2">
                <span className="text-xs font-black text-amber-500 uppercase tracking-widest block">
                  Scenario Control Clock
                </span>
                <div className="flex gap-2 bg-slate-950 p-2 border border-slate-800 rounded-lg">
                  {run.timer.isRunning ? (
                    <Button variant="outline" size="sm" className="w-full text-slate-200" onClick={pauseTimer}>
                      <Pause className="w-3.5 h-3.5 mr-1" /> Pause
                    </Button>
                  ) : (
                    <Button variant="gold" size="sm" className="w-full" onClick={startTimer}>
                      <Play className="w-3.5 h-3.5 mr-1 text-slate-950" /> Start/Resume
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" className="w-full" onClick={resetTimer}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
                  </Button>
                </div>
              </div>

              {/* Fire Building Manipulator */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-xs font-black text-red-500 uppercase tracking-widest block">
                  Incident Building Control
                </span>
                
                {selectedBldg ? (
                  <Card className="bg-slate-950 border-slate-800 p-3 flex flex-col gap-2">
                    <span className="text-xs font-black text-slate-200 uppercase">{selectedBldg.label}</span>
                    
                    {/* Toggle as incident building */}
                    <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded border border-slate-800">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Set Incident Focus:</span>
                      <Button 
                        variant={selectedBldg.selectedAsIncidentBuilding ? "mbfd" : "tactical"} 
                        size="sm" 
                        className="py-1 px-2.5 text-[10px] h-7 font-black"
                        onClick={handleToggleAsIncident}
                      >
                        {selectedBldg.selectedAsIncidentBuilding ? "ACTIVE FOCUS" : "SET FOCUS"}
                      </Button>
                    </div>

                    {/* Flame severity */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                        <Flame className="w-3 h-3 text-red-500" /> Fire Intensity
                      </span>
                      <div className="grid grid-cols-5 gap-1">
                        {["none", "light", "moderate", "heavy", "fully_involved"].map((level) => (
                          <button
                            key={level}
                            onClick={() => handleUpdateFire(level)}
                            className={`py-1 text-[8.5px] font-black rounded border transition capitalize ${
                              selectedBldg.fireCondition.intensity === level
                                ? "bg-red-700 text-white border-red-500 shadow-md"
                                : "bg-slate-900 text-slate-400 border-slate-800/80 hover:bg-slate-800"
                            }`}
                          >
                            {level.replace("_", " ")}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Smoke density */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                        <Wind className="w-3 h-3 text-slate-400" /> Smoke Density
                      </span>
                      <div className="grid grid-cols-5 gap-1">
                        {["none", "light", "moderate", "heavy", "black_turbulent"].map((level) => (
                          <button
                            key={level}
                            onClick={() => handleUpdateSmoke(level)}
                            className={`py-1 text-[8.5px] font-black rounded border transition capitalize ${
                              selectedBldg.smokeCondition.level === level
                                ? "bg-slate-600 text-slate-100 border-slate-400 shadow-md"
                                : "bg-slate-900 text-slate-400 border-slate-800/80 hover:bg-slate-800"
                            }`}
                          >
                            {level.replace("_", " ")}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Card>
                ) : (
                  <div className="p-3 bg-slate-950/40 border border-slate-800 border-dashed rounded text-center">
                    <p className="text-[11px] text-slate-500 italic">Select any building structure on the center board to control fire & smoke conditions.</p>
                  </div>
                )}
              </div>

              {/* Injects triggers */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-xs font-black text-slate-300 uppercase tracking-widest block">
                  Scenario Injects & Triggers
                </span>

                <div className="space-y-1.5 max-h-[160px] overflow-y-auto bg-slate-950 p-2 border border-slate-800 rounded-lg">
                  {/* Built-in sample injects triggers */}
                  {[
                    { id: "inj-dry", title: "1. Hydrant dry/OOS" },
                    { id: "inj-vic", title: "2. Victim Bravo side" },
                    { id: "inj-attic", title: "3. Fire in attic" },
                    { id: "inj-wire", title: "4. Delta wires down" },
                    { id: "inj-exp", title: "5. Exposure Bravo threat" },
                    { id: "inj-air", title: "6. Crew low air" },
                    { id: "inj-fpl", title: "7. FPL delayed" },
                    { id: "inj-block", title: "8. Truck access blocked" },
                    { id: "inj-water", title: "9. Water supply delayed" },
                    { id: "inj-knock", title: "10. Fire knocked down" }
                  ].map((inj) => (
                    <div key={inj.id} className="flex justify-between items-center gap-2 p-1 border-b border-slate-900 last:border-0">
                      <span className="text-[10px] font-bold text-slate-300 truncate">{inj.title}</span>
                      <Button
                        variant="gold"
                        className="h-6 px-2 py-0 text-[9px] font-black uppercase text-slate-950"
                        onClick={() => {
                          useScenarioStore.getState().logTimelineEvent("Instructor", `revealed training inject: ${inj.title}`, undefined);
                          alert(`Inject revealed successfully on the shared timeline: ${inj.title}`);
                        }}
                      >
                        REVEAL
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Inject Builder */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-xs font-black text-slate-300 uppercase tracking-widest block">
                  Publish Custom Injected Event
                </span>
                
                <Card className="bg-slate-950 border-slate-800 p-2.5 flex flex-col gap-2">
                  <Input 
                    value={customInjectTitle} 
                    onChange={e => setCustomInjectTitle(e.target.value)} 
                    placeholder="Inject Title (e.g. Explosion!)"
                    className="bg-slate-900 border-slate-800 text-[11px] h-8 font-bold text-slate-100 placeholder:text-slate-500"
                  />
                  <Textarea 
                    value={customInjectDesc} 
                    onChange={e => setCustomInjectDesc(e.target.value)} 
                    placeholder="Provide full description..."
                    className="bg-slate-900 border-slate-800 text-[10px] min-h-[45px] font-semibold text-slate-200 placeholder:text-slate-500"
                  />
                  <Button variant="mbfd" className="h-7 text-[10px] font-bold" onClick={handleAddCustomInject}>
                    <Send className="w-3 h-3 mr-1" /> Publish Custom Inject
                  </Button>
                </Card>
              </div>

              {/* Student Movement Lock Switch */}
              <div className="flex items-center justify-between p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                <div className="text-left">
                  <span className="text-xs font-black text-slate-300 uppercase tracking-widest block">Lock Student Movement</span>
                  <span className="text-[9px] text-slate-500">Stops student dragging of placed objects.</span>
                </div>
                <input
                  type="checkbox"
                  checked={isLocked}
                  onChange={(e) => {
                    setIsLocked(e.target.checked);
                    // Update all placed objects as locked/unlocked
                    Object.keys(run.objects).forEach((id) => {
                      updateObject(id, { locked: e.target.checked });
                    });
                    useScenarioStore.getState().logTimelineEvent("Instructor", `${e.target.checked ? "Locked" : "Unlocked"} student board coordinates movement`, undefined);
                  }}
                  className="w-4 h-4 cursor-pointer accent-red-600 shrink-0"
                />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
