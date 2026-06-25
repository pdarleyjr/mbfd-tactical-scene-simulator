import React, { useState, useEffect } from "react";
import { useScenarioStore } from "@/state/useScenarioStore";
import { useSessionStore } from "@/state/useSessionStore";
import { formatElapsed } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Clock, ShieldAlert, Award, FileText, Send, Radio } from "lucide-react";

export function TimerBenchmarkBar() {
  const { run, startTimer, pauseTimer, resetTimer, tickTimer, submitRadioReport, submitTacticalPlan } = useScenarioStore();
  const { designation, role, isSolo } = useSessionStore();

  const [elapsed, setElapsed] = useState(0);
  const [showIrrModal, setShowIrrModal] = useState(false);
  const [showTapModal, setShowTapModal] = useState(false);

  // IRR Form state
  const [buildingType, setBuildingType] = useState("");
  const [conditionsShowing, setConditionsShowing] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [action, setAction] = useState("");
  const [waterSupply, setWaterSupply] = useState("");
  const [commandName, setCommandName] = useState("");
  const [strategy, setStrategy] = useState<"Offensive" | "Defensive" | "Transitional">("Offensive");

  // TAP Form state
  const [tapStrategy, setTapStrategy] = useState("");
  const [firstLinePlacement, setFirstLinePlacement] = useState("");
  const [backupLine, setBackupLine] = useState("");
  const [searchPlan, setSearchPlan] = useState("");
  const [ventPlan, setVentPlan] = useState("");
  const [truckPlacementRationale, setTruckPlacementRationale] = useState("");
  const [waterSupplyPlan, setWaterSupplyPlan] = useState("");
  const [assignmentsNextUnits, setAssignmentsNextUnits] = useState("");
  const [safetyConcerns, setSafetyConcerns] = useState("");

  // Dynamic ticking
  useEffect(() => {
    const interval = setInterval(() => {
      if (run.timer.isRunning && run.timer.startedAt) {
        const now = Date.now();
        const started = Date.parse(run.timer.startedAt);
        const elapsedMs = now - started;
        setElapsed(Math.floor(run.timer.accumulatedSeconds + elapsedMs / 1000));
      } else {
        setElapsed(Math.floor(run.timer.accumulatedSeconds));
      }
    }, 200);

    return () => clearInterval(interval);
  }, [run.timer.isRunning, run.timer.startedAt, run.timer.accumulatedSeconds]);

  const handleBenchmarkClick = (name: string) => {
    const actor = designation || "Instructor";
    const note = prompt(`Optional: Enter notes for milestone [${name}]:`);
    
    useScenarioStore.getState().logTimelineEvent(actor, `Benchmark reached: ${name}${note ? ` - "${note}"` : ""}`, {
      benchmark: name,
      note
    });

    alert(`Benchmark logged: ${name}`);
  };

  const handleIrrSubmit = () => {
    const report = {
      id: Math.random().toString(36).substring(2, 9),
      submittedAt: new Date().toISOString(),
      actor: designation || "Instructor",
      buildingType,
      conditionsShowing,
      occupancy,
      action,
      waterSupply,
      commandName,
      strategy,
      fullReport: `${commandName} on scene. ${buildingType} showing ${conditionsShowing}. Conducting ${action} and establishing water supply via ${waterSupply}. Initiating ${strategy} operations.`
    };
    submitRadioReport(report);
    setShowIrrModal(false);
    
    // Clear
    setBuildingType("");
    setConditionsShowing("");
    setOccupancy("");
    setAction("");
    setWaterSupply("");
    setCommandName("");
  };

  const handleTapSubmit = () => {
    const plan = {
      id: Math.random().toString(36).substring(2, 9),
      submittedAt: new Date().toISOString(),
      actor: designation || "Instructor",
      strategy: tapStrategy,
      firstLinePlacement,
      backupLine,
      searchPlan,
      ventPlan,
      truckPlacementRationale,
      waterSupplyPlan,
      assignmentsNextUnits,
      safetyConcerns
    };
    submitTacticalPlan(plan);
    setShowTapModal(false);

    // Clear
    setTapStrategy("");
    setFirstLinePlacement("");
    setBackupLine("");
    setSearchPlan("");
    setVentPlan("");
    setTruckPlacementRationale("");
    setWaterSupplyPlan("");
    setAssignmentsNextUnits("");
    setSafetyConcerns("");
  };

  const isInstructor = role === "Host/Instructor" || isSolo;

  // 18 standard fire-ground tactical benchmarks as listed in prompt
  const benchmarksList = [
    "Command Established",
    "360 Complete",
    "First Apparatus Placed",
    "Water Supply Established",
    "5\" Supply Line Laid",
    "3\" Line Laid",
    "1 3/4\" Attack Line In Place",
    "Search Started",
    "Primary Search Complete",
    "Victim Rescued",
    "RIT Established",
    "Vent Started",
    "Utilities Controlled",
    "FPL Requested/Notified",
    "Fire Knocked Down",
    "Fire Out",
    "PAR Complete",
    "Command Transferred"
  ];

  return (
    <div className="h-[96px] bg-slate-950 border-t border-border flex items-center justify-between px-6 gap-6 shrink-0 select-none">
      {/* Clock timer display section */}
      <div className="flex items-center gap-4 shrink-0 bg-slate-900 border border-slate-800 p-2.5 rounded-lg shadow-inner min-w-[200px] text-left">
        <Clock className="w-8 h-8 text-amber-500" />
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase">Scenario Clock</span>
          <span className="text-2xl font-black text-slate-100 font-mono tracking-widest">{formatElapsed(elapsed)}</span>
        </div>
      </div>

      {/* Grid of touch-friendly oversized benchmark buttons */}
      <div className="flex-1 flex gap-2 overflow-x-auto items-center py-2 bg-slate-900/40 px-3 border border-slate-900 rounded-lg">
        {benchmarksList.map((bm) => (
          <Button
            key={bm}
            variant="tactical"
            className="h-11 px-3 whitespace-nowrap shrink-0 text-slate-300 font-bold border border-slate-800 hover:border-amber-500 hover:text-white"
            onClick={() => handleBenchmarkClick(bm)}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-500 inline mr-1" />
            {bm}
          </Button>
        ))}
      </div>

      {/* Size-Up / IRR / TAP submissions segment */}
      <div className="flex gap-2 shrink-0">
        <Button variant="mbfd" className="h-12 font-black shadow-lg" onClick={() => setShowIrrModal(true)}>
          <Radio className="w-4 h-4 mr-1" /> Size-Up Report (IRR)
        </Button>
        <Button variant="gold" className="h-12 text-slate-950 font-black shadow-lg" onClick={() => setShowTapModal(true)}>
          <FileText className="w-4 h-4 mr-1 text-slate-950" /> Tactical Plan (TAP)
        </Button>
      </div>

      {/* INITIAL RADIO REPORT MODAL */}
      <Dialog open={showIrrModal} onOpenChange={setShowIrrModal}>
        <DialogContent className="sm:max-w-[480px] bg-slate-900 border border-slate-800 text-slate-100 overflow-y-auto max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase text-red-500 flex items-center gap-2 border-b border-slate-850 pb-2">
              <Radio className="w-5 h-5 text-amber-500" />
              Initial Radio Size-Up Report (IRR)
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Deliver a clear tactical command size-up. Submitting publishes this to all users in the scenario room.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Incident Command Name</Label>
                <Input value={commandName} onChange={e => setCommandName(e.target.value)} placeholder="E.g., Broad St. Command" className="bg-slate-950 border-slate-800 font-bold text-xs" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Building Construction / Type</Label>
                <Input value={buildingType} onChange={e => setBuildingType(e.target.value)} placeholder="E.g. 2-story wood-frame" className="bg-slate-950 border-slate-800 font-bold text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Conditions Showing</Label>
                <Input value={conditionsShowing} onChange={e => setConditionsShowing(e.target.value)} placeholder="E.g. heavy fire on side Alpha" className="bg-slate-950 border-slate-800 font-bold text-xs" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Occupancy Type</Label>
                <Input value={occupancy} onChange={e => setOccupancy(e.target.value)} placeholder="E.g. Commercial row taxpayer" className="bg-slate-950 border-slate-800 font-bold text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Immediate Evolution / Action</Label>
                <Input value={action} onChange={e => setAction(e.target.value)} placeholder="E.g. transitional fire attack" className="bg-slate-950 border-slate-800 font-bold text-xs" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Water Supply Plan</Label>
                <Input value={waterSupply} onChange={e => setWaterSupply(e.target.value)} placeholder="E.g. forward lay from corner" className="bg-slate-950 border-slate-800 font-bold text-xs" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">Strategic Declaration</Label>
              <div className="flex gap-2">
                {["Offensive", "Defensive", "Transitional"].map((strat) => (
                  <button
                    key={strat}
                    type="button"
                    onClick={() => setStrategy(strat as any)}
                    className={`flex-1 py-1.5 rounded font-black text-xs border ${
                      strategy === strat
                        ? "bg-red-800 text-white border-red-500"
                        : "bg-slate-950 text-slate-400 border-slate-800"
                    }`}
                  >
                    {strat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="text-slate-400 border-slate-800" onClick={() => setShowIrrModal(false)}>
              Cancel
            </Button>
            <Button variant="mbfd" onClick={handleIrrSubmit} className="font-bold">
              <Send className="w-3.5 h-3.5 mr-1" /> Submit Size-Up (IRR)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TACTICAL ACTION PLAN MODAL */}
      <Dialog open={showTapModal} onOpenChange={setShowTapModal}>
        <DialogContent className="sm:max-w-[500px] bg-slate-900 border border-slate-800 text-slate-100 overflow-y-auto max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase text-red-500 flex items-center gap-2 border-b border-slate-850 pb-2">
              <FileText className="w-5 h-5 text-amber-500" />
              Tactical Action Plan (TAP)
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Define coordinates, priorities, search layout, ventilation path, and upcoming company assignments.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-3 text-left">
            <div>
              <Label className="text-[10px] font-bold text-slate-400 uppercase">Overall Incident Strategy</Label>
              <Input value={tapStrategy} onChange={e => setTapStrategy(e.target.value)} placeholder="E.g. Offensive fire attack & vertical roof vent" className="bg-slate-950 border-slate-800 text-xs" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">First Hose line placement rationale</Label>
                <Input value={firstLinePlacement} onChange={e => setFirstLinePlacement(e.target.value)} placeholder="E.g. protect side Bravo exposure" className="bg-slate-950 border-slate-800 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Backup Hose Line diameter/layout</Label>
                <Input value={backupLine} onChange={e => setBackupLine(e.target.value)} placeholder="E.g. 3-inch backup to stairwell" className="bg-slate-950 border-slate-800 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Primary Search Plan</Label>
                <Input value={searchPlan} onChange={e => setSearchPlan(e.target.value)} placeholder="E.g. Ladder 1 searching 2nd floor" className="bg-slate-950 border-slate-800 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Ventilation Strategy</Label>
                <Input value={ventPlan} onChange={e => setVentPlan(e.target.value)} placeholder="E.g. hydraulic vent via Alpha windows" className="bg-slate-950 border-slate-800 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Truck Placement / Aerial Setup</Label>
                <Input value={truckPlacementRationale} onChange={e => setTruckPlacementRationale(e.target.value)} placeholder="E.g. turntable at Alpha/Delta corner" className="bg-slate-950 border-slate-800 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Continuous Water Supply plan</Label>
                <Input value={waterSupplyPlan} onChange={e => setWaterSupplyPlan(e.target.value)} placeholder="E.g. 5-inch line from 450 gpm hydrant" className="bg-slate-950 border-slate-800 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Upcoming unit Assignments (Staging)</Label>
                <Input value={assignmentsNextUnits} onChange={e => setAssignmentsNextUnits(e.target.value)} placeholder="E.g. E3 RIT, E4 protect Exposure" className="bg-slate-950 border-slate-800 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase">Identified Safety concerns / risks</Label>
                <Input value={safetyConcerns} onChange={e => setSafetyConcerns(e.target.value)} placeholder="E.g. power lines down, low water pressure" className="bg-slate-950 border-slate-800 text-xs" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="text-slate-400 border-slate-800" onClick={() => setShowTapModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={handleTapSubmit} className="font-bold text-slate-950">
              <Send className="w-3.5 h-3.5 mr-1" /> Submit Action Plan (TAP)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
