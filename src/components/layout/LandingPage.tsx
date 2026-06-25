import React, { useState, useEffect } from "react";
import { useSessionStore } from "@/state/useSessionStore";
import { useUiStore } from "@/state/useUiStore";
import { useScenarioStore } from "@/state/useScenarioStore";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Shield, Users, Radio, Map, DownloadCloud, AlertTriangle } from "lucide-react";
import { sampleScenarios } from "@/data/sampleScenarios";
import { generateRoomCode } from "@/lib/ids";
import { db } from "@/db/dexie";

interface LandingPageProps {
  onNavigate: (route: "home" | "scenario-playing") => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const { 
    designation, 
    setDesignation, 
    setRoomCode, 
    setRole, 
    setIsSolo, 
    loadPreferences 
  } = useSessionStore();
  
  const { loadScenarioFromRun, resetScenarioRun, initializeTacticalConsiderations } = useScenarioStore();

  const [localName, setLocalName] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("residential-fire");
  const [modalMode, setModalMode] = useState<"solo" | "live-start" | "live-join" | null>(null);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    loadPreferences().then(() => {
      const saved = useSessionStore.getState().designation;
      if (saved) {
        setLocalName(saved);
      }
    });
  }, []);

  const validateDesignation = (name: string): boolean => {
    if (!name || name.trim() === "") {
      setValidationError("Designation is required.");
      return false;
    }
    if (name.length < 1 || name.length > 16) {
      setValidationError("Designation must be 1 to 16 characters.");
      return false;
    }
    // Allow letters, numbers, spaces, dash, period
    const regex = /^[a-zA-Z0-9\s\-\.]+$/;
    if (!regex.test(name)) {
      setValidationError("Only letters, numbers, spaces, dashes (-), and periods (.) allowed.");
      return false;
    }
    setValidationError("");
    return true;
  };

  const handleStartSolo = () => {
    setModalMode("solo");
    setValidationError("");
  };

  const handleStartLive = () => {
    setModalMode("live-start");
    setValidationError("");
  };

  const handleJoinLive = () => {
    setModalMode("live-join");
    setValidationError("");
  };

  const handleProceed = async () => {
    if (!validateDesignation(localName)) return;

    await setDesignation(localName.trim());

    if (modalMode === "solo") {
      setIsSolo(true);
      setRoomCode(null);
      setRole("Host/Instructor");
      
      // Load selected scenario template
      const template = sampleScenarios.find(s => s.id === selectedTemplateId) || sampleScenarios[0];
      resetScenarioRun("SOLO");
      
      // Build synchronous initial structures (buildings and hydrants)
      const initialObjects: Record<string, any> = {};
      template.buildings.forEach((bldg) => {
        initialObjects[bldg.id] = { ...bldg };
      });
      template.hydrants.forEach((hyd) => {
        initialObjects[hyd.id] = { ...hyd };
      });

      // Scaffold initial run
      const initialRun = {
        roomCode: "SOLO",
        scenarioId: template.id,
        scenarioTitle: template.title,
        objects: initialObjects,
        hoses: {},
        tacticalConsiderations: {},
        timer: { startedAt: null, pausedAt: null, accumulatedSeconds: 0, isRunning: false },
        timeline: [],
        radioReports: [],
        tacticalPlans: [],
        roster: {}
      };

      await loadScenarioFromRun(initialRun);
      initializeTacticalConsiderations(template.tacticalObjectives);
      
      onNavigate("scenario-playing");
    } 
    else if (modalMode === "live-start") {
      setIsSolo(false);
      const code = generateRoomCode();
      setRoomCode(code);
      setRole("Host/Instructor");
      
      const template = sampleScenarios.find(s => s.id === selectedTemplateId) || sampleScenarios[0];
      resetScenarioRun(code);

      // Build synchronous initial structures (buildings and hydrants)
      const initialObjects: Record<string, any> = {};
      template.buildings.forEach((bldg) => {
        initialObjects[bldg.id] = { ...bldg };
      });
      template.hydrants.forEach((hyd) => {
        initialObjects[hyd.id] = { ...hyd };
      });

      const initialRun = {
        roomCode: code,
        scenarioId: template.id,
        scenarioTitle: template.title,
        objects: initialObjects,
        hoses: {},
        tacticalConsiderations: {},
        timer: { startedAt: null, pausedAt: null, accumulatedSeconds: 0, isRunning: false },
        timeline: [],
        radioReports: [],
        tacticalPlans: [],
        roster: {}
      };

      await loadScenarioFromRun(initialRun);
      initializeTacticalConsiderations(template.tacticalObjectives);

      onNavigate("scenario-playing");
    } 
    else if (modalMode === "live-join") {
      if (!roomInput || roomInput.trim().length < 4) {
        setValidationError("Please enter a valid Room Code.");
        return;
      }
      setIsSolo(false);
      setRoomCode(roomInput.trim().toUpperCase());
      setRole("Participant");
      resetScenarioRun(roomInput.trim().toUpperCase());
      
      onNavigate("scenario-playing");
    }

    setModalMode(null);
  };

  const handleExportImport = () => {
    alert("Use the bottom panel export buttons or scenario library views inside a running scenario to import/export full scene JSON states.");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-y-auto">
      {/* Background Graphic Accents */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-red-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Badge */}
      <div className="flex items-center gap-3 mb-6 animate-fade-in">
        <div className="w-12 h-12 bg-red-700 border-2 border-red-500 rounded-full flex items-center justify-center shadow-lg">
          <Shield className="w-7 h-7 text-amber-400" />
        </div>
        <div className="text-left">
          <h1 className="text-2xl font-black tracking-wider text-slate-100 m-0">MBFD</h1>
          <p className="text-xs font-semibold text-slate-400 tracking-widest uppercase">Tactical Division</p>
        </div>
      </div>

      {/* Title */}
      <div className="text-center max-w-xl mb-10">
        <h2 className="text-3xl sm:text-4xl font-black text-slate-100 uppercase tracking-tight">
          Tactical Scene Simulator
        </h2>
        <p className="text-slate-400 mt-2 text-sm sm:text-base">
          Touch-first, browser-based command board for officer and driver-engineer training. Supports offline solo drilling and multi-tablet smartboard scenario coordination.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-3xl">
        {/* Solo Action */}
        <Card className="hover:border-red-600/50 transition-all shadow-xl bg-slate-900 border-slate-800/80 cursor-pointer flex flex-col justify-between" onClick={handleStartSolo}>
          <CardHeader className="pb-4">
            <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-2">
              <Shield className="w-6 h-6 text-red-500" />
            </div>
            <CardTitle className="text-xl font-bold uppercase text-slate-100">Solo Scenario</CardTitle>
            <CardDescription className="text-slate-400">
              Run offline, independent training exercises. Data persists in IndexedDB.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button variant="outline" className="w-full text-slate-200 border-slate-700 hover:bg-red-700 hover:text-white">
              Launch Solo Simulator
            </Button>
          </CardContent>
        </Card>

        {/* Live Active Board Action */}
        <Card className="hover:border-amber-500/50 transition-all shadow-xl bg-slate-900 border-slate-800/80 cursor-pointer flex flex-col justify-between" onClick={handleStartLive}>
          <CardHeader className="pb-4">
            <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-2">
              <Users className="w-6 h-6 text-amber-500" />
            </div>
            <CardTitle className="text-xl font-bold uppercase text-slate-100">Host Live Room</CardTitle>
            <CardDescription className="text-slate-400">
              Create a room, display the code on an 86" smartboard, and let participants join from tablets.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button variant="gold" className="w-full">
              Host Shared Room
            </Button>
          </CardContent>
        </Card>

        {/* Join Live Action */}
        <Card className="hover:border-amber-500/50 transition-all shadow-xl bg-slate-900 border-slate-800/80 cursor-pointer flex flex-col justify-between col-span-1 sm:col-span-2" onClick={handleJoinLive}>
          <CardHeader className="pb-4">
            <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-2">
              <Radio className="w-6 h-6 text-amber-400" />
            </div>
            <CardTitle className="text-xl font-bold uppercase text-slate-100">Join Active Room</CardTitle>
            <CardDescription className="text-slate-400">
              Enter a room code to participate in a live coordinated scenario with other officers and driver-engineers.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 flex gap-4">
            <Button variant="outline" className="w-full text-slate-200 border-slate-700 hover:bg-amber-500 hover:text-slate-950">
              Join Existing Scenario
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer Utility buttons */}
      <div className="flex gap-4 mt-8">
        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200" onClick={handleExportImport}>
          <DownloadCloud className="w-4 h-4 mr-1" /> Import/Export File
        </Button>
        <div className="text-slate-600 self-center">|</div>
        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200" onClick={() => alert("Scenarios can be selected right when you click Start Solo or Start Live. You will be prompted with a selector.")}>
          <Map className="w-4 h-4 mr-1" /> Scenario Library
        </Button>
      </div>

      {/* DESIGNATION / SCREEN NAME MODAL */}
      <Dialog open={modalMode !== null} onOpenChange={(open) => { if (!open) setModalMode(null); }}>
        <DialogContent className="sm:max-w-[420px] bg-slate-900 border border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-red-500 flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              Size-Up & Designation
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Before entering, verify your tactical designation or unit callsign. This is logged to the active timeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Input name */}
            <div className="space-y-2">
              <Label htmlFor="designation" className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                Tactical Unit designation / Callsign
              </Label>
              <Input
                id="designation"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="E.g., E1, L1, R1, 300, Capt. 5"
                maxLength={16}
                className="bg-slate-950 border-slate-800 text-slate-100 font-bold focus:border-red-600 focus:ring-red-600 uppercase"
              />
              <p className="text-xs text-slate-500">
                Type E1/E2 for engines, L1/L3 for ladders, R1 for rescue, 300/Capt. 5 for Command.
              </p>
            </div>

            {/* Room code if joining */}
            {modalMode === "live-join" && (
              <div className="space-y-2">
                <Label htmlFor="roomCode" className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                  Live Scenario Room Code
                </Label>
                <Input
                  id="roomCode"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="MBFD-XXXX"
                  maxLength={10}
                  className="bg-slate-950 border-slate-800 text-slate-100 font-bold text-lg tracking-wider focus:border-amber-500 focus:ring-amber-500 uppercase"
                />
              </div>
            )}

            {/* Template selector if starting solo or host */}
            {(modalMode === "solo" || modalMode === "live-start") && (
              <div className="space-y-2">
                <Label htmlFor="template" className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                  Select Incident Scene Template
                </Label>
                <Select
                  id="template"
                  value={selectedTemplateId}
                  onChange={(e: any) => setSelectedTemplateId(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100 font-semibold focus:border-red-600"
                >
                  {sampleScenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
                {/* Short template description */}
                <p className="text-xs text-slate-400 italic bg-slate-950/40 p-2 rounded border border-slate-800/50">
                  {sampleScenarios.find(s => s.id === selectedTemplateId)?.description}
                </p>
              </div>
            )}

            {validationError && (
              <div className="p-3 bg-red-950/40 border border-red-900 rounded flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <span className="text-xs text-red-300 font-semibold">{validationError}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="text-slate-400 border-slate-800" onClick={() => setModalMode(null)}>
              Cancel
            </Button>
            <Button variant="mbfd" onClick={handleProceed} className="font-bold">
              Proceed to Tactical Board
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
