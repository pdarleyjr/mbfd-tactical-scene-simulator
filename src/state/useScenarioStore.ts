import { create } from "zustand";
import type { 
  ScenarioRun, 
  ScenarioObject, 
  HoseLine, 
  TacticalConsideration, 
  TimelineEvent, 
  RadioReport, 
  TacticalPlan, 
  TimerState,
  ApparatusObject,
  BuildingObject
} from "@/types/scenario";
import { db } from "@/db/dexie";
import { useSessionStore } from "./useSessionStore";

// Type for the outbound websocket send function
type WsSendFn = (msg: any) => void;

interface ScenarioState {
  run: ScenarioRun;
  wsSend: WsSendFn | null;
  
  setWsSend: (sendFn: WsSendFn | null) => void;
  setScenarioRun: (run: ScenarioRun) => void;
  loadScenarioFromRun: (run: ScenarioRun) => void;
  
  // Roster
  updateRoster: (roster: any[]) => void;
  
  // Object Mutations
  addObject: (obj: ScenarioObject | ApparatusObject | BuildingObject) => void;
  updateObject: (id: string, update: Partial<ScenarioObject | ApparatusObject | BuildingObject>) => void;
  deleteObject: (id: string) => void;
  
  // Hose Mutations
  startHose: (hose: HoseLine) => void;
  updateHosePoints: (id: string, points: number[]) => void;
  completeHose: (id: string, connectedFromObjectId?: string, connectedToObjectId?: string, label?: string) => void;
  
  // Timer Actions
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  tickTimer: () => void; // local-only ticking helper
  
  // Tactical Checklist
  updateTactic: (id: string, update: Partial<TacticalConsideration>) => void;
  initializeTacticalConsiderations: (objectives: { category: string; description: string }[]) => void;
  
  // Injects
  revealInject: (id: string) => void;
  
  // Radio Reports & Tactical Plans
  submitRadioReport: (report: RadioReport) => void;
  submitTacticalPlan: (plan: TacticalPlan) => void;
  
  // Local Event Timeline Logger
  logTimelineEvent: (actor: string, description: string, metadata?: any) => void;
  
  // Reset Everything
  resetScenarioRun: (roomCode?: string) => void;
}

const initialRunState = (roomCode = "SOLO"): ScenarioRun => ({
  roomCode,
  scenarioId: "uninitialized",
  scenarioTitle: "New Scenario",
  objects: {},
  hoses: {},
  tacticalConsiderations: {},
  timer: {
    startedAt: null,
    pausedAt: null,
    accumulatedSeconds: 0,
    isRunning: false
  },
  timeline: [],
  radioReports: [],
  tacticalPlans: [],
  roster: {}
});

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  run: initialRunState(),
  wsSend: null,

  setWsSend: (sendFn) => set({ wsSend: sendFn }),
  
  setScenarioRun: (run) => set({ run }),
  
  loadScenarioFromRun: async (run) => {
    set({ run });
    // Cache run state locally in IndexedDB if solo
    if (useSessionStore.getState().isSolo) {
      await db.scenarioRuns.put(run);
    }
  },

  updateRoster: (rosterList) => {
    set((state) => {
      const rosterMap: Record<string, any> = {};
      rosterList.forEach(item => {
        rosterMap[item.clientId] = item;
      });
      return {
        run: { ...state.run, roster: rosterMap }
      };
    });
  },

  // Object actions
  addObject: (obj) => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        const nextObjects = { ...state.run.objects, [obj.id]: obj };
        const nextRun = { ...state.run, objects: nextObjects };
        
        // Log locally
        setTimeout(() => get().logTimelineEvent(designation, `Placed object: ${obj.label || obj.type}`), 0);
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "object_add", object: obj });
    }
  },

  updateObject: (id, update) => {
    const isSolo = useSessionStore.getState().isSolo;
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        if (!state.run.objects[id]) return {};
        const updated = { ...state.run.objects[id], ...update, updatedAt: new Date().toISOString() } as any;
        const nextObjects = { ...state.run.objects, [id]: updated };
        const nextRun = { ...state.run, objects: nextObjects };
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else {
      // Optimistic update locally for fluid drag & drop
      set((state) => {
        if (!state.run.objects[id]) return {};
        const updated = { ...state.run.objects[id], ...update, updatedAt: new Date().toISOString() } as any;
        return {
          run: {
            ...state.run,
            objects: { ...state.run.objects, [id]: updated }
          }
        };
      });
      if (wsSend) {
        wsSend({ type: "object_update", id, update });
      }
    }
  },

  deleteObject: (id) => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        if (!state.run.objects[id]) return {};
        const obj = state.run.objects[id];
        const nextObjects = { ...state.run.objects };
        delete nextObjects[id];
        const nextRun = { ...state.run, objects: nextObjects };
        
        setTimeout(() => get().logTimelineEvent(designation, `Removed object: ${obj.label || obj.type}`), 0);
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "object_delete", id });
    }
  },

  // Hose line actions
  startHose: (hose) => {
    const isSolo = useSessionStore.getState().isSolo;
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        const nextHoses = { ...state.run.hoses, [hose.id]: hose };
        const nextRun = { ...state.run, hoses: nextHoses };
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "hose_start", hose });
    }
  },

  updateHosePoints: (id, points) => {
    const isSolo = useSessionStore.getState().isSolo;
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        if (!state.run.hoses[id]) return {};
        const updated = { ...state.run.hoses[id], points };
        const nextHoses = { ...state.run.hoses, [id]: updated };
        const nextRun = { ...state.run, hoses: nextHoses };
        return { run: nextRun };
      });
    } else {
      // Optimistic update locally for drawing line tracking mouse
      set((state) => {
        if (!state.run.hoses[id]) return {};
        const updated = { ...state.run.hoses[id], points };
        return {
          run: {
            ...state.run,
            hoses: { ...state.run.hoses, [id]: updated }
          }
        };
      });
      if (wsSend) {
        wsSend({ type: "hose_update", id, points });
      }
    }
  },

  completeHose: (id, connectedFromObjectId, connectedToObjectId, label) => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        if (!state.run.hoses[id]) return {};
        const updated = { 
          ...state.run.hoses[id], 
          completedAt: new Date().toISOString(),
          isDrawing: false,
          connectedFromObjectId,
          connectedToObjectId,
          label: label || state.run.hoses[id].label
        };
        const nextHoses = { ...state.run.hoses, [id]: updated };
        const nextRun = { ...state.run, hoses: nextHoses };
        
        setTimeout(() => get().logTimelineEvent(designation, `Laid hose line: ${updated.label || updated.hoseType}`), 0);
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "hose_complete", id, connectedFromObjectId, connectedToObjectId, label });
    }
  },

  // Timer actions
  startTimer: () => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        if (state.run.timer.isRunning) return {};
        const nextTimer: TimerState = {
          ...state.run.timer,
          startedAt: new Date().toISOString(),
          isRunning: true
        };
        const nextRun = { ...state.run, timer: nextTimer };
        
        setTimeout(() => get().logTimelineEvent(designation, `Scenario timer started`), 0);
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "timer_start" });
    }
  },

  pauseTimer: () => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        const t = state.run.timer;
        if (!t.isRunning || !t.startedAt) return {};
        
        const now = Date.now();
        const started = Date.parse(t.startedAt);
        const elapsedMs = now - started;
        
        const nextTimer: TimerState = {
          startedAt: null,
          pausedAt: new Date().toISOString(),
          accumulatedSeconds: t.accumulatedSeconds + (elapsedMs / 1000),
          isRunning: false
        };
        const nextRun = { ...state.run, timer: nextTimer };
        
        setTimeout(() => get().logTimelineEvent(designation, `Scenario timer paused`), 0);
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "timer_pause" });
    }
  },

  resumeTimer: () => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        if (state.run.timer.isRunning) return {};
        const nextTimer: TimerState = {
          ...state.run.timer,
          startedAt: new Date().toISOString(),
          pausedAt: null,
          isRunning: true
        };
        const nextRun = { ...state.run, timer: nextTimer };
        
        setTimeout(() => get().logTimelineEvent(designation, `Scenario timer resumed`), 0);
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "timer_resume" });
    }
  },

  resetTimer: () => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        const nextTimer: TimerState = {
          startedAt: null,
          pausedAt: null,
          accumulatedSeconds: 0,
          isRunning: false
        };
        const nextRun = { ...state.run, timer: nextTimer };
        
        setTimeout(() => get().logTimelineEvent(designation, `Scenario timer reset`), 0);
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "timer_reset" });
    }
  },

  tickTimer: () => {
    // Only ticks internal clock locally (non-broadcasting animation frames)
    if (!get().run.timer.isRunning) return;
    set((state) => ({ ...state }));
  },

  // Tactical considerations
  updateTactic: (id, update) => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        if (!state.run.tacticalConsiderations[id]) return {};
        const current = state.run.tacticalConsiderations[id];
        const updated: TacticalConsideration = {
          ...current,
          ...update,
          updatedAt: new Date().toISOString()
        };
        const nextRun = {
          ...state.run,
          tacticalConsiderations: { ...state.run.tacticalConsiderations, [id]: updated }
        };
        
        if (update.status && update.status !== current.status) {
          setTimeout(() => get().logTimelineEvent(designation, `Updated tactic [${updated.category}] status to: ${updated.status}`), 0);
        }
        
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "tactical_update", id, update });
    }
  },

  initializeTacticalConsiderations: (objectives) => {
    set((state) => {
      const considerations: Record<string, TacticalConsideration> = {};
      objectives.forEach((obj) => {
        const id = Math.random().toString(36).substring(2, 9);
        considerations[id] = {
          id,
          category: obj.category,
          status: "Not Started",
          assignedUnit: "",
          notes: obj.description || "",
          updatedAt: new Date().toISOString()
        };
      });
      const nextRun = { ...state.run, tacticalConsiderations: considerations };
      if (useSessionStore.getState().isSolo) {
        db.scenarioRuns.put(nextRun);
      }
      return { run: nextRun };
    });
  },

  // Reveal injects
  revealInject: (id) => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        const nextTimeline = [...state.run.timeline];
        // Mark reveal in inject state or metadata if applicable
        const eventId = Math.random().toString(36).substring(2, 9);
        
        setTimeout(() => get().logTimelineEvent(designation, `Instructor revealed inject: ${id}`), 0);
        return {};
      });
    } else if (wsSend) {
      wsSend({ type: "inject_reveal", id });
    }
  },

  submitRadioReport: (report) => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        const nextRun = {
          ...state.run,
          radioReports: [...state.run.radioReports, report]
        };
        setTimeout(() => get().logTimelineEvent(designation, `Submitted Initial Radio Report as [${report.commandName}]`), 0);
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "radio_report_submit", report });
    }
  },

  submitTacticalPlan: (plan) => {
    const isSolo = useSessionStore.getState().isSolo;
    const designation = useSessionStore.getState().designation || "Instructor";
    const wsSend = get().wsSend;

    if (isSolo) {
      set((state) => {
        const nextRun = {
          ...state.run,
          tacticalPlans: [...state.run.tacticalPlans, plan]
        };
        setTimeout(() => get().logTimelineEvent(designation, `Submitted Tactical Action Plan`), 0);
        db.scenarioRuns.put(nextRun);
        return { run: nextRun };
      });
    } else if (wsSend) {
      wsSend({ type: "tactical_plan_submit", plan });
    }
  },

  logTimelineEvent: (actor, description, metadata) => {
    set((state) => {
      const event: TimelineEvent = {
        id: Math.random().toString(36).substring(2, 9),
        type: "log",
        description,
        elapsedSeconds: Math.floor(
          state.run.timer.accumulatedSeconds +
          (state.run.timer.isRunning && state.run.timer.startedAt
            ? (Date.now() - Date.parse(state.run.timer.startedAt)) / 1000
            : 0)
        ),
        absoluteTimestamp: new Date().toISOString(),
        actor,
        metadata
      };
      
      const nextRun = {
        ...state.run,
        timeline: [...state.run.timeline, event]
      };
      if (useSessionStore.getState().isSolo) {
        db.scenarioRuns.put(nextRun);
      }
      return { run: nextRun };
    });
  },

  resetScenarioRun: (roomCode) => {
    set({ run: initialRunState(roomCode) });
  }
}));
