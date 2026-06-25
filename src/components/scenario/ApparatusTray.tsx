import React from "react";
import { apparatusTemplates } from "@/data/apparatus";
import type { ApparatusTemplate } from "@/data/apparatus";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Shield, HelpCircle } from "lucide-react";

export function ApparatusTray() {
  const handleDragStart = (e: React.DragEvent, template: ApparatusTemplate) => {
    const payload = JSON.stringify(template);
    e.dataTransfer.setData("application/react-mbfd-apparatus", payload);
    e.dataTransfer.setData("text/plain", payload); // Fallback for maximum browser compatibility
    e.dataTransfer.effectAllowed = "copy";
  };

  const groupTemplates = (kind: string) => {
    return apparatusTemplates.filter(t => t.kind === kind);
  };

  return (
    <div className="w-[280px] bg-slate-900 border-r border-border p-4 flex flex-col gap-4 overflow-y-auto select-none shrink-0 h-full">
      {/* Overview Info Card */}
      <div className="flex flex-col gap-1 text-left bg-slate-950/60 p-3 rounded-lg border border-slate-800">
        <h3 className="text-xs font-black text-red-500 uppercase tracking-widest flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-amber-500" />
          Command Board
        </h3>
        <p className="text-[11px] text-slate-400 mt-1 leading-normal">
          Drag apparatus onto the tactical board to place units on the scene. Rotate and arrange them as incident unfolds.
        </p>
      </div>

      {/* Engines group */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[10px] font-black tracking-widest text-slate-400 uppercase text-left border-b border-slate-800 pb-1">
          Engines (Attack/Supply)
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {groupTemplates("engine").map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t)}
              className="touch-target border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-md p-2 flex flex-col items-center justify-center gap-1 cursor-grab active:cursor-grabbing hover:border-red-600 transition shadow-md"
            >
              <div className="w-7 h-3.5 bg-red-800 rounded border border-red-500" />
              <span className="text-xs font-black text-slate-100 uppercase">{t.designation}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ladder Trucks */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[10px] font-black tracking-widest text-slate-400 uppercase text-left border-b border-slate-800 pb-1">
          Ladders (Aerial/Vent)
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {groupTemplates("ladder").map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t)}
              className="touch-target border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-md p-2 flex flex-col items-center justify-center gap-1 cursor-grab active:cursor-grabbing hover:border-slate-500 transition shadow-md"
            >
              <div className="w-8 h-3.5 bg-slate-800 rounded border border-slate-600 flex items-center justify-center">
                <div className="w-6 h-0.5 bg-white opacity-40" />
              </div>
              <span className="text-xs font-black text-slate-100 uppercase">{t.designation}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rescues */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[10px] font-black tracking-widest text-slate-400 uppercase text-left border-b border-slate-800 pb-1">
          Rescues (EMS/Ambulance)
        </h4>
        <div className="grid grid-cols-3 gap-1.5">
          {groupTemplates("rescue").map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t)}
              className="touch-target border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-md p-1.5 flex flex-col items-center justify-center gap-1 cursor-grab active:cursor-grabbing hover:border-sky-500 transition shadow-md"
            >
              <div className="w-6 h-3 bg-red-900 rounded border border-red-400 flex items-center justify-center">
                <span className="text-[6px] text-sky-400 font-bold leading-none">+</span>
              </div>
              <span className="text-[10px] font-black text-slate-100 uppercase">{t.designation}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Command / SUVs */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[10px] font-black tracking-widest text-slate-400 uppercase text-left border-b border-slate-800 pb-1">
          Command / SUVs
        </h4>
        <div className="grid grid-cols-2 gap-2">
          { apparatusTemplates.filter(t => t.kind === "command_suv" || t.kind === "safety_suv").map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t)}
              className="touch-target border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-md p-2 flex flex-col items-center justify-center gap-1 cursor-grab active:cursor-grabbing hover:border-amber-500 transition shadow-md"
            >
              <div className="w-6 h-3 bg-amber-600 rounded border border-amber-400" />
              <span className="text-[11px] font-black text-slate-100 uppercase">{t.designation}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Help Overlay */}
      <div className="mt-auto border border-dashed border-slate-800 p-2.5 rounded-lg flex items-start gap-2 bg-slate-950/20 text-left">
        <HelpCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Board Tip:</span>
          <span className="text-[10px] text-slate-500 leading-normal block">
            Double-click or tap placed apparatus to view rotation handles & locking controls.
          </span>
        </div>
      </div>
    </div>
  );
}
