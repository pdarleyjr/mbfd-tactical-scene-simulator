import React from "react";
import { useScenarioStore } from "@/state/useScenarioStore";
import { useSessionStore } from "@/state/useSessionStore";
import { Users, Shield, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export function RosterView() {
  const { run } = useScenarioStore();
  const { clientId: currentClientId } = useSessionStore();
  const rosterArray = Object.values(run.roster);

  return (
    <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">
          Active Scenario Roster ({rosterArray.length})
        </span>
      </div>

      <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
        {rosterArray.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No users joined yet. (Solo Mode)</p>
        ) : (
          rosterArray.map((member) => {
            const isMe = member.clientId === currentClientId;
            const isOnline = member.connectionState === "online";

            return (
              <div
                key={member.clientId}
                className={cn(
                  "flex items-center justify-between p-2 rounded border text-xs",
                  isMe 
                    ? "bg-slate-950 border-amber-500/40 text-slate-100" 
                    : "bg-slate-950/40 border-slate-800/60 text-slate-400"
                )}
              >
                <div className="flex items-center gap-2 font-bold uppercase">
                  <Circle 
                    className={cn(
                      "w-2 h-2 fill-current", 
                      isOnline ? "text-green-500" : "text-red-500"
                    )} 
                  />
                  <span>{member.designation}</span>
                  {isMe && <span className="text-[9px] text-amber-500 font-bold tracking-widest bg-amber-950/40 border border-amber-900/30 px-1 rounded uppercase">YOU</span>}
                </div>

                <div className="flex items-center gap-1 text-[9px] text-slate-500 font-semibold tracking-wider">
                  <Shield className="w-2.5 h-2.5 text-slate-600" />
                  <span>{member.role === "Host/Instructor" ? "INSTRUCTOR" : "CREW"}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
