import { create } from "zustand";

export type CanvasTool = "select" | "hose5" | "hose3" | "hose175" | "hydrant" | "hazard" | "victim" | "powerline" | "wind" | "erase";

interface UiState {
  activeTool: CanvasTool;
  selectedObjectId: string | null;
  zoom: number;
  panX: number;
  panY: number;
  isLocked: boolean; // whether student movement is locked by instructor
  showDesignationModal: boolean;
  activeTabRight: "instructor" | "tactics" | "considerations";
  getStageDataUrl: (() => string) | null;
  
  setActiveTool: (tool: CanvasTool) => void;
  setSelectedObjectId: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setIsLocked: (locked: boolean) => void;
  setShowDesignationModal: (show: boolean) => void;
  setActiveTabRight: (tab: "instructor" | "tactics" | "considerations") => void;
  resetViewport: () => void;
  setGetStageDataUrl: (fn: (() => string) | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTool: "select",
  selectedObjectId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  isLocked: false,
  showDesignationModal: false,
  activeTabRight: "tactics",
  getStageDataUrl: null,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(zoom, 4)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setIsLocked: (locked) => set({ isLocked: locked }),
  setShowDesignationModal: (show) => set({ showDesignationModal: show }),
  setActiveTabRight: (tab) => set({ activeTabRight: tab }),
  resetViewport: () => set({ zoom: 1, panX: 0, panY: 0 }),
  setGetStageDataUrl: (fn) => set({ getStageDataUrl: fn })
}));
